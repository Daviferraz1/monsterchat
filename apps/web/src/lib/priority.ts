/**
 * Prioridade do atendimento. Os valores são os que já existiam em
 * conversations.priority desde a migração 003 (nunca tinham sido usados).
 */
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface PriorityMeta {
  value: Priority;
  label: string;
  /** Ordena o quadro: urgente primeiro. */
  weight: number;
  color: string;
  chipClass: string;
}

export const PRIORITIES: readonly PriorityMeta[] = [
  {
    value: 'urgent',
    label: 'Urgente',
    weight: 0,
    color: '#ef4444',
    chipClass: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  {
    value: 'high',
    label: 'Alta',
    weight: 1,
    color: '#f59e0b',
    chipClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  {
    value: 'normal',
    label: 'Normal',
    weight: 2,
    color: '#64748b',
    chipClass: 'bg-white/5 text-gray-400 border-white/10',
  },
  {
    value: 'low',
    label: 'Baixa',
    weight: 3,
    color: '#475569',
    chipClass: 'bg-white/5 text-gray-500 border-white/10',
  },
];

export function priorityMeta(value?: string | null): PriorityMeta {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[2];
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && PRIORITIES.some((p) => p.value === value);
}
