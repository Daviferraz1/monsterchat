/**
 * Vocabulário do painel de desempenho.
 *
 * Duas decisões que valem para o arquivo inteiro:
 *
 * 1. Percentil, nunca média. Numa amostra real de 14 dias a média de espera deu
 *    53 min contra 4 min de mediana — algumas conversas esquecidas por dias
 *    puxam a média sozinhas. A mediana descreve o dia normal; o p90 descreve a
 *    cauda, que é onde o aluno desiste e some.
 *
 * 2. Cada métrica sabe para que lado é "melhor" (`direction`). Sem isso um
 *    painel com "tempo de resposta" e "tarefas concluídas" lado a lado pinta a
 *    barra maior de verde nos dois casos, e num deles está errado.
 */

import { diasNoMesEmBrasilia, partesEmBrasilia } from './timezone';

export type MetricKey =
  | 'conversations_handled'
  | 'answers_sent'
  | 'first_response_p50'
  | 'reply_rate'
  | 'tasks_completed'
  | 'tasks_on_time_rate'
  | 'task_resolution_p50';

export type GoalPeriod = 'daily' | 'weekly' | 'monthly';

export interface MetricDef {
  key: MetricKey;
  label: string;
  /** Explicação curta — vai no title do cartão, para ninguém adivinhar o que conta. */
  help: string;
  unit: 'count' | 'seconds' | 'percent';
  /** 'up' = quanto maior melhor. 'down' = quanto menor melhor. */
  direction: 'up' | 'down';
  /** Sugestão inicial de meta mensal, para o gestor ter de onde partir. */
  suggested: number;
}

export const METRICS: readonly MetricDef[] = [
  {
    key: 'conversations_handled',
    label: 'Conversas atendidas',
    help: 'Alunos distintos que receberam pelo menos uma resposta sua no período.',
    unit: 'count',
    direction: 'up',
    suggested: 300,
  },
  {
    key: 'answers_sent',
    label: 'Respostas enviadas',
    help: 'Rodadas que você fechou: o aluno perguntou, você respondeu.',
    unit: 'count',
    direction: 'up',
    suggested: 800,
  },
  {
    key: 'first_response_p50',
    label: 'Tempo de resposta (mediana)',
    help: 'Metade das perguntas foi respondida em menos que isso.',
    unit: 'seconds',
    direction: 'down',
    suggested: 300,
  },
  {
    key: 'reply_rate',
    label: 'Perguntas respondidas',
    help: 'Das perguntas que chegaram, quantas não ficaram no vácuo.',
    unit: 'percent',
    direction: 'up',
    suggested: 95,
  },
  {
    key: 'tasks_completed',
    label: 'Tarefas concluídas',
    help: 'Tarefas que você moveu para Concluída no período.',
    unit: 'count',
    direction: 'up',
    suggested: 40,
  },
  {
    key: 'tasks_on_time_rate',
    label: 'Tarefas no prazo',
    help: 'Das tarefas com prazo que você concluiu, quantas saíram antes de vencer.',
    unit: 'percent',
    direction: 'up',
    suggested: 90,
  },
  {
    key: 'task_resolution_p50',
    label: 'Tempo de solução (mediana)',
    help: 'Da hora em que a tarefa caiu no seu nome até você concluir.',
    unit: 'seconds',
    direction: 'down',
    suggested: 86400,
  },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m])
) as Record<MetricKey, MetricDef>;

export const PERIOD_LABEL: Record<GoalPeriod, string> = {
  daily: 'por dia',
  weekly: 'por semana',
  monthly: 'por mês',
};

// --- formatação ------------------------------------------------------------

/** Duração legível e curta o bastante para caber num eixo: "4 min", "1,5 h", "2 d". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, seconds);
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) {
    const h = s / 3600;
    return `${h < 10 ? h.toFixed(1).replace('.', ',') : Math.round(h)} h`;
  }
  const d = s / 86400;
  return `${d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)} d`;
}

export function formatMetric(value: number | null | undefined, unit: MetricDef['unit']): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (unit === 'seconds') return formatDuration(value);
  if (unit === 'percent') return `${Math.round(value)}%`;
  return new Intl.NumberFormat('pt-BR').format(Math.round(value));
}

// --- estatística -----------------------------------------------------------

/** Percentil por interpolação linear — mesmo método do percentile_cont do Postgres. */
export function percentile(values: number[], q: number): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return v[low];
  return v[low] + (v[high] - v[low]) * (pos - low);
}

export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

// --- metas -----------------------------------------------------------------

export interface GoalProgress {
  /** 0 a 1. Em métrica "quanto menor melhor", ficar abaixo do alvo já é 100%. */
  ratio: number;
  /** 'ok' bateu, 'perto' passou de 80%, 'longe' o resto. */
  state: 'ok' | 'perto' | 'longe';
}

export function goalProgress(
  value: number | null | undefined,
  target: number,
  direction: MetricDef['direction']
): GoalProgress {
  if (value == null || !Number.isFinite(value) || target <= 0) {
    return { ratio: 0, state: 'longe' };
  }
  // Em métrica invertida o progresso é alvo/valor: gastar metade do tempo
  // permitido vale o dobro, e estourar o alvo derruba proporcionalmente.
  const raw = direction === 'up' ? value / target : target / value;
  const ratio = Math.max(0, Math.min(1.5, raw));
  const state: GoalProgress['state'] = ratio >= 1 ? 'ok' : ratio >= 0.8 ? 'perto' : 'longe';
  return { ratio, state };
}

/** Quanto do período já passou — serve para comparar meta com ritmo esperado. */
export function periodElapsed(period: GoalPeriod, now = new Date()): number {
  // Progresso da meta é medido no relógio de Brasília: getHours()/getDate() devolvem UTC
  // no servidor, o que adiantava o dia em 3 horas e inflava o "esperado até agora".
  const { hora, minuto, dia, diaDaSemana } = partesEmBrasilia(now);
  const fracaoDoDia = (hora * 60 + minuto) / (24 * 60);

  if (period === 'daily') {
    return fracaoDoDia;
  }
  if (period === 'weekly') {
    return (diaDaSemana + fracaoDoDia) / 7; // diaDaSemana: segunda = 0
  }
  return (dia - 1 + fracaoDoDia) / diasNoMesEmBrasilia(now);
}

// --- contratos da API ------------------------------------------------------

export interface DailyPoint {
  dia: string;
  rodadas: number;
  respondidas: number;
  p50: number | null;
  p90: number | null;
}

export interface AgentPoint {
  agent_user_id: string | null;
  respostas: number;
  conversas: number;
  p50: number | null;
  p90: number | null;
}

export interface HeatCell {
  dia_semana: number;
  hora: number;
  perguntas: number;
  respondidas: number;
  p50: number | null;
}

export interface DepartmentPoint {
  department_id: string | null;
  rodadas: number;
  respondidas: number;
  p50: number | null;
}

export interface ConversationMetrics {
  rodadas: number;
  respondidas: number;
  conversas: number;
  p50: number | null;
  p90: number | null;
  diario: DailyPoint[];
  pessoas: AgentPoint[];
  mapa: HeatCell[];
  departamentos: DepartmentPoint[];
}

export interface TaskAgentStats {
  userId: string | null;
  criadas: number;
  concluidas: number;
  noPrazo: number;
  comPrazo: number;
  abertas: number;
  atrasadas: number;
  /** Da atribuição até a pessoa abrir a tarefa. Mede se a fila é olhada. */
  tempoAteVer: number | null;
  /** Da atribuição até concluir. */
  tempoSolucao: number | null;
}

/**
 * Tarefa que precisa de atenção agora.
 *
 * A ordem dos motivos é a ordem em que doem: prazo estourado primeiro, depois o
 * que vence hoje, depois o que foi atribuído e a pessoa nem abriu, e por fim o
 * que está na fila sem dono. "Não vista" e "sem dono" são as duas formas de uma
 * demanda sumir sem ninguém perceber — que é a dor que originou o módulo.
 */
export type MotivoAtencao = 'atrasada' | 'vence_hoje' | 'nao_vista' | 'sem_dono';

export interface TaskAlert {
  id: string;
  title: string;
  assignedTo: string | null;
  dueAt: string | null;
  motivo: MotivoAtencao;
  /** Segundos de atraso, de folga até vencer, ou de espera parada. */
  segundos: number;
}

export const PESO_ATENCAO: Record<MotivoAtencao, number> = {
  atrasada: 0,
  vence_hoje: 1,
  nao_vista: 2,
  sem_dono: 3,
};

export interface TaskMetrics {
  total: number;
  concluidas: number;
  abertas: number;
  atrasadas: number;
  noPrazoPct: number | null;
  tempoSolucao: number | null;
  tempoAteVer: number | null;
  porStatus: Record<string, number>;
  porPessoa: TaskAgentStats[];
  /** Concluídas por dia — a linha de ritmo. */
  diario: { dia: string; concluidas: number; criadas: number }[];
  /** O que está pedindo ação agora, já ordenado por urgência. */
  atencao: TaskAlert[];
}

export interface GoalRow {
  id: string;
  user_id: string;
  metric: MetricKey;
  period: GoalPeriod;
  target: number;
}

export interface MetricsResponse {
  range: { from: string; to: string; days: number };
  me: { userId: string; fullName: string | null; isManager: boolean };
  members: { userId: string; fullName: string | null }[];
  departments: { id: string; name: string; color: string | null }[];
  conversations: ConversationMetrics;
  tasks: TaskMetrics;
  goals: GoalRow[];
  /**
   * Avisos honestos sobre buraco de dado — o painel mostra isso na tela em vez
   * de fingir que o número zero significa desempenho zero.
   */
  avisos: string[];
}
