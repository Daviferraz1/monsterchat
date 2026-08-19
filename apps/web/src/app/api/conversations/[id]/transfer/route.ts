import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { canSeeConversation, getTeamContext } from '@/lib/api/team';
import { isPriority } from '@/lib/priority';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/conversations/[id]/transfer
 * body: { toUserId?, toDepartmentId?, priority?, reason? }
 *
 * Transfere a conversa para outro operador e/ou outro departamento e registra o
 * movimento em conversation_transfers (o gestor precisa saber por onde a conversa passou).
 *
 * Cuidado que a rota toma: não deixar a conversa cair num lugar onde o destinatário
 * não enxerga. Se você manda para alguém de escopo 'department' e o departamento da
 * conversa não é o dele, o departamento é ajustado junto — senão a conversa some
 * para todo mundo.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const conversationId = params.id;
  if (!conversationId) {
    return NextResponse.json({ error: 'id da conversa é obrigatório' }, { status: 400 });
  }

  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const hasUser = 'toUserId' in body;
    const hasDepartment = 'toDepartmentId' in body;
    if (!hasUser && !hasDepartment && !isPriority(body.priority)) {
      return NextResponse.json(
        { error: 'Informe toUserId, toDepartmentId e/ou priority' },
        { status: 400 }
      );
    }
    const toUserId: string | null =
      hasUser && typeof body.toUserId === 'string' && body.toUserId ? body.toUserId : null;
    const toDepartmentId: string | null =
      hasDepartment && typeof body.toDepartmentId === 'string' && body.toDepartmentId
        ? body.toDepartmentId
        : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null;
    const priority = isPriority(body.priority) ? body.priority : null;

    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select('id, assigned_to, department_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }
    if (!canSeeConversation(ctx, conversation)) {
      return NextResponse.json({ error: 'Você não tem acesso a esta conversa' }, { status: 403 });
    }

    // Destinatário precisa ser alguém ativo da equipe com login vinculado.
    let target: { id: string; scope: string; departmentIds: string[] } | null = null;
    if (toUserId) {
      const { data: member } = await supabaseAdmin
        .from('team_members')
        .select('id, conversation_scope, role, sector_id')
        .eq('user_id', toUserId)
        .eq('active', true)
        .maybeSingle();
      if (!member) {
        return NextResponse.json(
          { error: 'Destinatário não está cadastrado como colaborador ativo' },
          { status: 400 }
        );
      }
      const { data: extra } = await supabaseAdmin
        .from('team_member_departments')
        .select('department_id')
        .eq('team_member_id', member.id);
      const isManager = member.role === 'admin' || member.role === 'gestor';
      target = {
        id: member.id,
        scope: isManager ? 'all' : member.conversation_scope ?? 'department',
        departmentIds: Array.from(
          new Set([member.sector_id, ...(extra ?? []).map((d) => d.department_id)].filter(Boolean))
        ) as string[],
      };
    }

    if (toDepartmentId) {
      const { data: department } = await supabaseAdmin
        .from('sectors')
        .select('id, active')
        .eq('id', toDepartmentId)
        .maybeSingle();
      if (!department || !department.active) {
        return NextResponse.json({ error: 'Departamento inválido ou inativo' }, { status: 400 });
      }
    }

    const requestedDepartment = hasDepartment ? toDepartmentId : conversation.department_id;
    let finalDepartment = requestedDepartment;

    if (target) {
      if (!finalDepartment && target.departmentIds.length > 0) {
        // Triagem automática: mandar para alguém do Financeiro coloca a conversa no Financeiro.
        finalDepartment = target.departmentIds[0];
      } else if (
        target.scope === 'department' &&
        finalDepartment &&
        !target.departmentIds.includes(finalDepartment)
      ) {
        // Anti-conversa-fantasma: com escopo 'department', o destinatário não veria
        // a conversa que acabou de receber. Corrige o departamento junto.
        if (target.departmentIds.length === 0) {
          return NextResponse.json(
            { error: 'O destinatário não está em nenhum departamento. Ajuste o cadastro dele antes.' },
            { status: 409 }
          );
        }
        finalDepartment = target.departmentIds[0];
      }
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      department_id: finalDepartment,
      updated_at: now,
    };
    if (priority) patch.priority = priority;
    if (hasUser) {
      patch.assigned_to = toUserId;
      patch.assigned_at = toUserId ? now : null;
      patch.assigned_by = toUserId ? ctx.userId : null;
    }

    const { error: updateError } = await supabaseAdmin
      .from('conversations')
      .update(patch)
      .eq('id', conversationId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabaseAdmin.from('conversation_transfers').insert({
      conversation_id: conversationId,
      from_user_id: conversation.assigned_to,
      to_user_id: hasUser ? toUserId : conversation.assigned_to,
      from_department: conversation.department_id,
      to_department: finalDepartment,
      transferred_by: ctx.userId,
      reason,
    });

    return NextResponse.json({
      ok: true,
      assigned_to: hasUser ? toUserId : conversation.assigned_to,
      department_id: finalDepartment,
      // Avisa a UI quando o departamento foi corrigido para o destinatário enxergar.
      department_adjusted: finalDepartment !== requestedDepartment,
    });
  } catch (err) {
    console.error('[API conversations/transfer] POST', err);
    return NextResponse.json({ error: 'Falha ao transferir a conversa' }, { status: 500 });
  }
}
