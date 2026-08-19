/**
 * Cálculo da próxima ocorrência de uma tarefa recorrente.
 *
 * Tudo em UTC de propósito: a data guardada é a de vencimento, e somar mês em
 * cima de horário local dá resultado diferente conforme o dia do ano.
 */

export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface RecurrenceRule {
  frequency: Frequency;
  interval_count: number;
  day_of_week?: number | null;
  day_of_month?: number | null;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Próxima ocorrência estritamente depois de `from`.
 *
 * Mensal com dia 31 em fevereiro cai no último dia do mês em vez de vazar para
 * março — senão "todo dia 31" pula meses inteiros.
 */
export function nextOccurrence(rule: RecurrenceRule, from: Date): Date {
  const step = Math.max(1, rule.interval_count || 1);
  const next = new Date(from.getTime());

  if (rule.frequency === 'daily') {
    next.setUTCDate(next.getUTCDate() + step);
    return next;
  }

  if (rule.frequency === 'weekly') {
    const target = rule.day_of_week ?? from.getUTCDay();
    // Anda uma semana (vezes o intervalo) e ajusta para o dia da semana pedido.
    next.setUTCDate(next.getUTCDate() + step * 7);
    const diff = (target - next.getUTCDay() + 7) % 7;
    next.setUTCDate(next.getUTCDate() + diff);
    return next;
  }

  // monthly
  const target = rule.day_of_month ?? from.getUTCDate();
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + step;
  const normalizedYear = year + Math.floor(month / 12);
  const normalizedMonth = ((month % 12) + 12) % 12;
  const day = Math.min(target, lastDayOfMonth(normalizedYear, normalizedMonth));
  return new Date(
    Date.UTC(
      normalizedYear,
      normalizedMonth,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      0,
      0
    )
  );
}

/** Primeira ocorrência a partir de hoje, para quando a regra é criada. */
export function firstOccurrence(rule: RecurrenceRule, reference: Date): Date {
  const base = new Date(reference.getTime());
  base.setUTCHours(9, 0, 0, 0); // vence de manhã, não à meia-noite

  if (rule.frequency === 'daily') {
    return base > reference ? base : nextOccurrence(rule, base);
  }

  if (rule.frequency === 'weekly') {
    const target = rule.day_of_week ?? base.getUTCDay();
    const diff = (target - base.getUTCDay() + 7) % 7;
    const candidate = new Date(base.getTime());
    candidate.setUTCDate(candidate.getUTCDate() + diff);
    return candidate > reference ? candidate : nextOccurrence(rule, candidate);
  }

  const target = rule.day_of_month ?? base.getUTCDate();
  const day = Math.min(target, lastDayOfMonth(base.getUTCFullYear(), base.getUTCMonth()));
  const candidate = new Date(base.getTime());
  candidate.setUTCDate(day);
  return candidate > reference ? candidate : nextOccurrence(rule, candidate);
}
