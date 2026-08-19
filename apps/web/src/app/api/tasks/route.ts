import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext, type TeamContext } from '@/lib/api/team';
import { isPriority } from '@/lib/priority';
import { dueFromNow } from '@/lib/deadline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATUSES = ['open', 'pending', 'snoozed', 'closed'] as const;
type Status = (typeof STATUSES)[number];

function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** Mesma regra da RLS da 043, para a rota recusar antes de tentar escrever. */
function canSeeTask(
  ctx: TeamContext,
  task: { assigned_to?: string | null; created_by?: string | null; department_id?: string | null }
): boolean {
  if (ctx.scope === 'all') return true;
  if (task.assigned_to && task.assigned_to === ctx.userId) return true;
  if (task.created_by && task.created_by === ctx.userId) return true;
  if (ctx.scope === 'assigned') return false;
  if (!task.department_id) return true;
  return ctx.departmentIds.includes(task.department_id);
}

const text = (v: unknown, max = 2000) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const uuid = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** Cria uma tarefa. O solicitante é sempre quem está logado. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const title = text(body.title, 200);
    if (!title) return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 });

    const assignedTo = uuid(body.assignedTo);
    const now = new Date().toISOString();

    const slaMinutes =
      Number.isFinite(body.slaMinutes) && Number(body.slaMinutes) > 0
        ? Math.round(Number(body.slaMinutes))
        : null;

    // Departamento padrão do tipo, quando não veio escolhido — poupa um clique
    // no caso comum ("Financeiro" quase sempre cai no Financeiro).
    let departmentId = uuid(body.departmentId);
    const taskTypeId = uuid(body.taskTypeId);
    if (!departmentId && taskTypeId) {
      const { data: type } = await supabaseAdmin
        .from('task_types')
        .select('default_department_id')
        .eq('id', taskTypeId)
        .maybeSingle();
      departmentId = type?.default_department_id ?? null;
    }

    // Prazo explícito vence o limite; sem ele, o limite calcula a data.
    const explicitDue = text(body.dueAt, 40);
    const dueAt = explicitDue ?? (slaMinutes ? dueFromNow(slaMinutes).toISOString() : null);

    const { data: task, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        title,
        description: text(body.description),
        task_type_id: taskTypeId,
        department_id: departmentId,
        created_by: ctx.userId,
        assigned_to: assignedTo,
        assigned_at: assignedTo ? now : null,
        assigned_by: assignedTo ? ctx.userId : null,
        contact_id: uuid(body.contactId),
        conversation_id: uuid(body.conversationId),
        priority: isPriority(body.priority) ? body.priority : 'normal',
        due_at: dueAt,
        sla_minutes: slaMinutes,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, task });
  } catch (err) {
    console.error('[API tasks] POST', err);
    return NextResponse.json({ error: 'Falha ao criar a tarefa' }, { status: 500 });
  }
}

/**
 * Atualiza uma tarefa.
 *
 * Carimba sozinho os marcos que o gestor quer enxergar sem perguntar a ninguém:
 * quando o responsável abriu (first_seen_at), quando saiu de "A fazer"
 * (started_at) e quando concluiu (completed_at + quem).
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const id = uuid(body.id);
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('id, assigned_to, created_by, department_id, status, started_at, first_seen_at')
      .eq('id', id)
      .maybeSingle();
    if (!task) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
    if (!canSeeTask(ctx, task)) {
      return NextResponse.json({ error: 'Você não tem acesso a esta tarefa' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };

    if (body.title !== undefined) {
      const title = text(body.title, 200);
      if (!title) return NextResponse.json({ error: 'Título não pode ficar vazio' }, { status: 400 });
      patch.title = title;
    }
    if (body.description !== undefined) patch.description = text(body.description);
    if (body.taskTypeId !== undefined) patch.task_type_id = uuid(body.taskTypeId);
    if (body.departmentId !== undefined) patch.department_id = uuid(body.departmentId);
    if (body.contactId !== undefined) patch.contact_id = uuid(body.contactId);
    if (body.conversationId !== undefined) patch.conversation_id = uuid(body.conversationId);
    if (body.dueAt !== undefined) patch.due_at = text(body.dueAt, 40);
    if (body.slaMinutes !== undefined) {
      patch.sla_minutes =
        Number.isFinite(body.slaMinutes) && Number(body.slaMinutes) > 0
          ? Math.round(Number(body.slaMinutes))
          : null;
    }
    if (isPriority(body.priority)) patch.priority = body.priority;

    if (body.assignedTo !== undefined) {
      const assignedTo = uuid(body.assignedTo);
      patch.assigned_to = assignedTo;
      patch.assigned_at = assignedTo ? now : null;
      patch.assigned_by = assignedTo ? ctx.userId : null;
    }

    // "Já viu?" — só conta para o responsável; o gestor abrindo não marca como vista.
    if (body.seen === true && !task.first_seen_at && task.assigned_to === ctx.userId) {
      patch.first_seen_at = now;
    }

    if (isStatus(body.status)) {
      patch.status = body.status;
      if (body.status !== 'open' && !task.started_at) patch.started_at = now;
      if (body.status === 'closed') {
        patch.completed_at = now;
        patch.completed_by = ctx.userId;
      } else {
        patch.completed_at = null;
        patch.completed_by = null;
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('tasks')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, task: updated });
  } catch (err) {
    console.error('[API tasks] PATCH', err);
    return NextResponse.json({ error: 'Falha ao atualizar a tarefa' }, { status: 500 });
  }
}
