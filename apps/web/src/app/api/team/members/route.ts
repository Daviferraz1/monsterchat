import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext, type ConversationScope, type TeamRole } from '@/lib/api/team';

export const dynamic = 'force-dynamic';

const ROLES: TeamRole[] = ['atendente', 'supervisor', 'gestor', 'admin'];
const SCOPES: ConversationScope[] = ['all', 'department', 'assigned'];

async function requireManager() {
  const ctx = await getTeamContext();
  if (!ctx) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  if (!ctx.isManager) {
    return { error: NextResponse.json({ error: 'Só gestor ou admin pode gerenciar a equipe' }, { status: 403 }) };
  }
  return { ctx };
}

/** Substitui os departamentos do colaborador (N:N) e mantém sector_id como o principal. */
async function setDepartments(memberId: string, departmentIds: string[]) {
  await supabaseAdmin.from('team_member_departments').delete().eq('team_member_id', memberId);
  if (departmentIds.length > 0) {
    await supabaseAdmin.from('team_member_departments').insert(
      departmentIds.map((department_id) => ({ team_member_id: memberId, department_id }))
    );
  }
}

function parseDepartments(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return Array.from(new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0)));
}

/** Equipe completa (inclui inativos) + e-mails de login. Só gestor/admin. */
export async function GET() {
  const guard = await requireManager();
  if (guard.error) return guard.error;

  try {
    const [{ data: members, error }, { data: authList }, { data: links }] = await Promise.all([
      supabaseAdmin
        .from('team_members')
        .select('id, user_id, full_name, email, role, conversation_scope, sector_id, active, created_at')
        .order('active', { ascending: false })
        .order('full_name'),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      supabaseAdmin.from('team_member_departments').select('team_member_id, department_id'),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const emailByUser = new Map((authList?.users ?? []).map((u) => [u.id, u.email ?? null]));
    const byMember = new Map<string, string[]>();
    for (const link of links ?? []) {
      const list = byMember.get(link.team_member_id) ?? [];
      list.push(link.department_id);
      byMember.set(link.team_member_id, list);
    }
    const linkedUserIds = new Set((members ?? []).map((m) => m.user_id).filter(Boolean));

    return NextResponse.json({
      members: (members ?? []).map((m) => ({
        ...m,
        login_email: m.user_id ? emailByUser.get(m.user_id) ?? null : null,
        department_ids: Array.from(new Set([m.sector_id, ...(byMember.get(m.id) ?? [])].filter(Boolean))),
      })),
      // Logins que existem no Supabase Auth e ainda não estão vinculados a ninguém.
      unlinkedUsers: (authList?.users ?? [])
        .filter((u) => !linkedUserIds.has(u.id))
        .map((u) => ({ id: u.id, email: u.email ?? '' })),
    });
  } catch (err) {
    console.error('[API team/members] GET', err);
    return NextResponse.json({ error: 'Falha ao listar a equipe' }, { status: 500 });
  }
}

/** Cadastra um colaborador (opcionalmente já vinculado a um login existente). */
export async function POST(request: NextRequest) {
  const guard = await requireManager();
  if (guard.error) return guard.error;

  try {
    const body = await request.json().catch(() => ({}));
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    if (!fullName) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    const role: TeamRole = ROLES.includes(body.role) ? body.role : 'atendente';
    const scope: ConversationScope = SCOPES.includes(body.scope) ? body.scope : 'department';
    const departmentIds = parseDepartments(body.departmentIds) ?? [];
    const userId = typeof body.userId === 'string' && body.userId ? body.userId : null;

    if (userId) {
      const { data: taken } = await supabaseAdmin
        .from('team_members')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (taken) {
        return NextResponse.json({ error: 'Este login já está vinculado a outro colaborador' }, { status: 409 });
      }
    }

    const { data: created, error } = await supabaseAdmin
      .from('team_members')
      .insert({
        full_name: fullName,
        email: typeof body.email === 'string' ? body.email.trim() || null : null,
        user_id: userId,
        role,
        conversation_scope: scope,
        sector_id: departmentIds[0] ?? null,
        active: true,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await setDepartments(created.id, departmentIds);
    return NextResponse.json({ ok: true, id: created.id });
  } catch (err) {
    console.error('[API team/members] POST', err);
    return NextResponse.json({ error: 'Falha ao cadastrar colaborador' }, { status: 500 });
  }
}

/** Edita cargo, escopo, departamentos, vínculo de login ou ativa/desativa. */
export async function PATCH(request: NextRequest) {
  const guard = await requireManager();
  if (guard.error) return guard.error;
  const ctx = guard.ctx!;

  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.fullName === 'string' && body.fullName.trim()) patch.full_name = body.fullName.trim();
    if (typeof body.email === 'string') patch.email = body.email.trim() || null;
    if (ROLES.includes(body.role)) patch.role = body.role;
    if (SCOPES.includes(body.scope)) patch.conversation_scope = body.scope;
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (body.userId === null) patch.user_id = null;
    else if (typeof body.userId === 'string' && body.userId) patch.user_id = body.userId;

    const departmentIds = parseDepartments(body.departmentIds);
    if (departmentIds) patch.sector_id = departmentIds[0] ?? null;

    // Trava de segurança: o admin não pode se rebaixar nem se desativar se for o
    // último com poder de configuração — senão ninguém mais entra em Config › Equipe.
    const losingPower =
      (patch.role !== undefined && !['admin', 'gestor'].includes(String(patch.role))) ||
      patch.active === false;
    if (losingPower) {
      const { data: target } = await supabaseAdmin
        .from('team_members')
        .select('user_id, role')
        .eq('id', id)
        .maybeSingle();
      const targetIsManager = target && ['admin', 'gestor'].includes(target.role);
      if (targetIsManager) {
        const { count } = await supabaseAdmin
          .from('team_members')
          .select('id', { count: 'exact', head: true })
          .eq('active', true)
          .in('role', ['admin', 'gestor']);
        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            { error: 'Este é o último gestor ativo. Promova outra pessoa antes de alterar.' },
            { status: 409 }
          );
        }
      }
      if (target?.user_id && target.user_id === ctx.userId && patch.active === false) {
        return NextResponse.json({ error: 'Você não pode desativar o próprio acesso' }, { status: 409 });
      }
    }

    const { error } = await supabaseAdmin.from('team_members').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (departmentIds) await setDepartments(id, departmentIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API team/members] PATCH', err);
    return NextResponse.json({ error: 'Falha ao atualizar colaborador' }, { status: 500 });
  }
}
