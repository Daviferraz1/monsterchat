import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { nextOccurrence, type RecurrenceRule } from '@/lib/api/recurrence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/tasks/cron/recurring — gera as tarefas das regras recorrentes.
 *
 * Roda pelo Cron da Vercel (mesmo padrão do /api/ia/cron/weekly: CRON_SECRET no
 * header Authorization). É idempotente: a tarefa nasce com (recurrence_id, due_at),
 * que tem índice único — se o cron rodar duas vezes no mesmo dia, a segunda
 * inserção é recusada e a regra avança do mesmo jeito.
 *
 * Cria com antecedência (lead_days) para a tarefa aparecer no quadro ANTES de
 * vencer. Um boleto que só surge no dia do vencimento já nasce atrasado.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const { data: rules, error } = await supabaseAdmin
      .from('task_recurrences')
      .select('*')
      .eq('active', true)
      .order('next_due_at');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let created = 0;
    let advanced = 0;
    const problems: string[] = [];

    for (const rule of rules ?? []) {
      const rec: RecurrenceRule = {
        frequency: rule.frequency,
        interval_count: rule.interval_count,
        day_of_week: rule.day_of_week,
        day_of_month: rule.day_of_month,
      };

      let dueAt = new Date(rule.next_due_at);
      let nextDue = dueAt;
      let guard = 0;

      // Enquanto a próxima ocorrência já entrou na janela de antecedência, cria.
      // O laço cobre regras que ficaram paradas (cron fora do ar, regra reativada).
      while (guard < 24) {
        const openAt = new Date(dueAt.getTime() - rule.lead_days * 86400000);
        if (openAt > now) break;

        const { error: insertError } = await supabaseAdmin.from('tasks').insert({
          title: rule.title,
          description: rule.description,
          task_type_id: rule.task_type_id,
          department_id: rule.department_id,
          assigned_to: rule.assigned_to,
          assigned_at: rule.assigned_to ? new Date().toISOString() : null,
          created_by: rule.created_by,
          priority: rule.priority,
          due_at: dueAt.toISOString(),
          recurrence_id: rule.id,
        });

        if (insertError) {
          // 23505 = a ocorrência já existe. Esperado quando o cron repete.
          if (insertError.code !== '23505') {
            problems.push(`${rule.title}: ${insertError.message}`);
            break;
          }
        } else {
          created += 1;
        }

        nextDue = nextOccurrence(rec, dueAt);
        dueAt = nextDue;
        guard += 1;
      }

      if (nextDue.toISOString() !== rule.next_due_at) {
        await supabaseAdmin
          .from('task_recurrences')
          .update({
            next_due_at: nextDue.toISOString(),
            last_created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', rule.id);
        advanced += 1;
      }
    }

    return NextResponse.json({ ok: true, regras: rules?.length ?? 0, created, advanced, problems });
  } catch (err) {
    console.error('[API tasks/cron/recurring]', err);
    return NextResponse.json({ error: 'Falha ao gerar tarefas recorrentes' }, { status: 500 });
  }
}
