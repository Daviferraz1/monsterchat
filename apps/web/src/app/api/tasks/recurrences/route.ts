import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext } from '@/lib/api/team';
import { isPriority } from '@/lib/priority';
import { firstOccurrence, nextOccurrence, type Frequency, type RecurrenceRule } from '@/lib/api/recurrence';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly'];

const uuid = (v: unknown) => (typeof v === 'string' && v ? v : null);
const text = (v: unknown, max = 2000) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Regras de recorrência. Qualquer um vê as suas; gestor vê todas. */
export async function GET() {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  let query = supabaseAdmin
    .from('task_recurrences')
    .select('*')
    .order('active', { ascending: false })
    .order('next_due_at');
  if (!ctx.isManager) {
    query = query.or(`created_by.eq.${ctx.userId},assigned_to.eq.${ctx.userId}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recurrences: data ?? [] });
}

/** Cria a regra e já calcula quando ela vence pela primeira vez. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const title = text(body.title, 200);
    if (!title) return NextResponse.json({ error: 'Título é obrigatório' }, { status: 400 });

    const frequency = FREQUENCIES.includes(body.frequency) ? (body.frequency as Frequency) : null;
    if (!frequency) {
      return NextResponse.json({ error: 'Frequência inválida' }, { status: 400 });
    }

    const rule: RecurrenceRule = {
      frequency,
      interval_count: clampInt(body.intervalCount, 1, 12, 1),
      day_of_week: frequency === 'weekly' ? clampInt(body.dayOfWeek, 0, 6, 1) : null,
      day_of_month: frequency === 'monthly' ? clampInt(body.dayOfMonth, 1, 31, 1) : null,
    };

    const firstDue = body.nextDueAt
      ? new Date(String(body.nextDueAt))
      : firstOccurrence(rule, new Date());
    if (Number.isNaN(firstDue.getTime())) {
      return NextResponse.json({ error: 'Data inicial inválida' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('task_recurrences')
      .insert({
        title,
        description: text(body.description),
        task_type_id: uuid(body.taskTypeId),
        department_id: uuid(body.departmentId),
        assigned_to: uuid(body.assignedTo),
        priority: isPriority(body.priority) ? body.priority : 'normal',
        frequency: rule.frequency,
        interval_count: rule.interval_count,
        day_of_week: rule.day_of_week,
        day_of_month: rule.day_of_month,
        lead_days: clampInt(body.leadDays, 0, 60, 3),
        next_due_at: firstDue.toISOString(),
        created_by: ctx.userId,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Se a janela de antecedência já está aberta, cria a primeira ocorrência
    // agora. Sem isso a regra é salva e nada aparece no quadro até o cron rodar,
    // o que passa a impressão de que não funcionou.
    const leadDays = data.lead_days ?? 3;
    const opensAt = new Date(firstDue.getTime() - leadDays * 86400000);
    let firstTaskCreated = false;
    if (opensAt <= new Date()) {
      const { error: taskError } = await supabaseAdmin.from('tasks').insert({
        title: data.title,
        description: data.description,
        task_type_id: data.task_type_id,
        department_id: data.department_id,
        assigned_to: data.assigned_to,
        assigned_at: data.assigned_to ? new Date().toISOString() : null,
        created_by: ctx.userId,
        priority: data.priority,
        due_at: firstDue.toISOString(),
        recurrence_id: data.id,
      });
      if (!taskError) {
        firstTaskCreated = true;
        const following = nextOccurrence(rule, firstDue);
        await supabaseAdmin
          .from('task_recurrences')
          .update({ next_due_at: following.toISOString(), last_created_at: new Date().toISOString() })
          .eq('id', data.id);
      }
    }

    return NextResponse.json({ ok: true, recurrence: data, firstTaskCreated });
  } catch (err) {
    console.error('[API tasks/recurrences] POST', err);
    return NextResponse.json({ error: 'Falha ao criar a recorrência' }, { status: 500 });
  }
}

/** Edita ou desliga uma regra. Desligar não apaga as tarefas já geradas. */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const id = uuid(body.id);
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const { data: rule } = await supabaseAdmin
      .from('task_recurrences')
      .select('id, created_by, assigned_to')
      .eq('id', id)
      .maybeSingle();
    if (!rule) return NextResponse.json({ error: 'Regra não encontrada' }, { status: 404 });
    if (!ctx.isManager && rule.created_by !== ctx.userId && rule.assigned_to !== ctx.userId) {
      return NextResponse.json({ error: 'Sem acesso a esta regra' }, { status: 403 });
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) {
      const title = text(body.title, 200);
      if (!title) return NextResponse.json({ error: 'Título não pode ficar vazio' }, { status: 400 });
      patch.title = title;
    }
    if (body.description !== undefined) patch.description = text(body.description);
    if (body.assignedTo !== undefined) patch.assigned_to = uuid(body.assignedTo);
    if (body.departmentId !== undefined) patch.department_id = uuid(body.departmentId);
    if (body.taskTypeId !== undefined) patch.task_type_id = uuid(body.taskTypeId);
    if (isPriority(body.priority)) patch.priority = body.priority;
    if (body.leadDays !== undefined) patch.lead_days = clampInt(body.leadDays, 0, 60, 3);
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (body.nextDueAt !== undefined) {
      const when = new Date(String(body.nextDueAt));
      if (Number.isNaN(when.getTime())) {
        return NextResponse.json({ error: 'Data inválida' }, { status: 400 });
      }
      patch.next_due_at = when.toISOString();
    }

    const { error } = await supabaseAdmin.from('task_recurrences').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API tasks/recurrences] PATCH', err);
    return NextResponse.json({ error: 'Falha ao atualizar a recorrência' }, { status: 500 });
  }
}
