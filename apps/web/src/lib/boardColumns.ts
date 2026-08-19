import type { ConversationStatus } from '@/types';

/**
 * Raias do quadro. São os valores que já existem em conversations.status
 * (open/pending/snoozed/closed), então arrastar um card grava de verdade —
 * não é um estado só da tela.
 *
 * O inbox continua entendendo os mesmos valores: "Abertas" = open,
 * "Finalizadas" = closed. Pendente e adiada não eram usadas e ganham
 * significado aqui.
 */
export interface BoardColumn {
  status: ConversationStatus;
  label: string;
  hint: string;
  color: string;
}

export const BOARD_COLUMNS: readonly BoardColumn[] = [
  {
    status: 'open',
    label: 'A fazer',
    hint: 'Chegou e ainda não foi tocada',
    color: '#f59e0b',
  },
  {
    status: 'pending',
    label: 'Em andamento',
    hint: 'Operador está resolvendo agora',
    color: '#3b82f6',
  },
  {
    status: 'snoozed',
    label: 'Aguardando',
    hint: 'Depende do aluno ou de outro setor',
    color: '#a855f7',
  },
  {
    status: 'closed',
    label: 'Concluída',
    hint: 'Atendimento encerrado',
    color: '#22c55e',
  },
];

export function columnOf(status: ConversationStatus): BoardColumn {
  return BOARD_COLUMNS.find((c) => c.status === status) ?? BOARD_COLUMNS[0];
}

/** Campos que mudam junto com o status (closed_at alimenta o isFinalized). */
export function statusPatch(status: ConversationStatus): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    status,
    closed_at: status === 'closed' ? now : null,
    updated_at: now,
  };
}

/** "há 3 h", "há 2 d" — quanto tempo o card está parado. */
export function timeAgo(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'há 1 mês' : `há ${months} meses`;
}
