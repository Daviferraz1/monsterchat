import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext } from '@/lib/api/team';

export const dynamic = 'force-dynamic';

/**
 * Lista enxuta de departamentos + colaboradores, para a UI do inbox
 * (badge de departamento, diálogo de transferência, filtro "meu setor").
 *
 * Fica numa rota de servidor em vez de policy no PostgREST porque team_members
 * guarda dado de RH (jornada de trabalho). Aqui devolvemos só nome, cargo e setor.
 * Também devolve o contexto do próprio usuário, que a UI usa para decidir o que mostrar.
 */
export async function GET() {
  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const [{ data: departments }, { data: members }, { data: links }] = await Promise.all([
      supabaseAdmin
        .from('sectors')
        .select('id, name, color, sla_first_response_minutes, active, sort_order')
        .eq('active', true)
        .order('sort_order')
        .order('name'),
      supabaseAdmin
        .from('team_members')
        .select('id, user_id, full_name, role, sector_id, conversation_scope')
        .eq('active', true)
        .order('full_name'),
      supabaseAdmin.from('team_member_departments').select('team_member_id, department_id'),
    ]);

    const byMember = new Map<string, string[]>();
    for (const link of links ?? []) {
      const list = byMember.get(link.team_member_id) ?? [];
      list.push(link.department_id);
      byMember.set(link.team_member_id, list);
    }

    return NextResponse.json({
      me: {
        userId: ctx.userId,
        memberId: ctx.memberId,
        fullName: ctx.fullName,
        role: ctx.role,
        scope: ctx.scope,
        departmentIds: ctx.departmentIds,
        isManager: ctx.isManager,
      },
      departments: departments ?? [],
      members: (members ?? []).map((m) => ({
        id: m.id,
        userId: m.user_id,
        fullName: m.full_name,
        role: m.role,
        scope: m.conversation_scope,
        departmentIds: Array.from(
          new Set([m.sector_id, ...(byMember.get(m.id) ?? [])].filter(Boolean))
        ),
      })),
    });
  } catch (err) {
    console.error('[API team/directory] GET', err);
    return NextResponse.json({ error: 'Falha ao carregar a equipe' }, { status: 500 });
  }
}
