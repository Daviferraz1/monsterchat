/**
 * Limite de tempo para resolver uma tarefa.
 *
 * As opções são atalhos que calculam o prazo a partir de agora — quem abre a
 * demanda pensa em "resolve em 2 dias", não em "vence 21/08 às 14h32".
 */
export interface SlaOption {
  minutes: number;
  label: string;
}

export const SLA_OPTIONS: readonly SlaOption[] = [
  { minutes: 60, label: '1 hora' },
  { minutes: 4 * 60, label: '4 horas' },
  { minutes: 8 * 60, label: '8 horas (mesmo dia)' },
  { minutes: 24 * 60, label: '1 dia' },
  { minutes: 2 * 24 * 60, label: '2 dias' },
  { minutes: 3 * 24 * 60, label: '3 dias' },
  { minutes: 5 * 24 * 60, label: '5 dias' },
  { minutes: 7 * 24 * 60, label: '1 semana' },
  { minutes: 15 * 24 * 60, label: '15 dias' },
  { minutes: 30 * 24 * 60, label: '30 dias' },
];

export function slaLabel(minutes?: number | null): string | null {
  if (!minutes) return null;
  const known = SLA_OPTIONS.find((o) => o.minutes === minutes);
  if (known) return known.label;
  if (minutes % (24 * 60) === 0) {
    const days = minutes / (24 * 60);
    return days === 1 ? '1 dia' : `${days} dias`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
  return `${minutes} min`;
}

/** Prazo = agora + limite, para o formulário mostrar a data resultante. */
export function dueFromNow(minutes: number, from = new Date()): Date {
  return new Date(from.getTime() + minutes * 60000);
}

/**
 * "faltam 3 h" / "atrasada há 2 d". É o texto que cria urgência no card —
 * uma data solta não diz se dá tempo.
 */
export function remainingLabel(dueAt?: string | null, now = Date.now()): string | null {
  if (!dueAt) return null;
  const diff = new Date(dueAt).getTime() - now;
  const late = diff < 0;
  const minutes = Math.floor(Math.abs(diff) / 60000);

  let quantidade: string;
  if (minutes < 1) quantidade = 'menos de 1 min';
  else if (minutes < 60) quantidade = `${minutes} min`;
  else if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    quantidade = `${hours} h`;
  } else {
    const days = Math.floor(minutes / (24 * 60));
    quantidade = days === 1 ? '1 dia' : `${days} dias`;
  }

  return late ? `atrasada há ${quantidade}` : `faltam ${quantidade}`;
}

/** Perto de estourar (últimos 20% do prazo) — o card fica âmbar antes de ficar vermelho. */
export function isAtRisk(
  dueAt?: string | null,
  slaMinutes?: number | null,
  now = Date.now()
): boolean {
  if (!dueAt) return false;
  const remaining = new Date(dueAt).getTime() - now;
  if (remaining <= 0) return false;
  const total = (slaMinutes ?? 24 * 60) * 60000;
  return remaining <= total * 0.2;
}
