import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext, type TeamContext } from '@/lib/api/team';
import {
  median,
  PESO_ATENCAO,
  type ConversationMetrics,
  type MotivoAtencao,
  type TaskAlert,
  type TaskMetrics,
  type TaskAgentStats,
} from '@/lib/metrics';
import type { Task } from '@/types';

export const dynamic = 'force-dynamic';

const MAX_DIAS = 180;

/**
 * Painel de desempenho.
 *
 * As conversas vêm agregadas do Postgres (função metrics_conversations, migração
 * 045) porque parear pergunta/resposta em 78 mil mensagens no Node seria
 * inviável. As tarefas vêm cruas e são agregadas aqui — são poucas, e assim as
 * regras de "no prazo" e "atrasada" ficam num lugar só, junto com o quadro.
 *
 * Escopo: operador vê o próprio número; gestor vê a equipe. Quem decide é o
 * mesmo contexto que governa o inbox, não um parâmetro da query.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const url = new URL(request.url);
    const dias = Math.min(MAX_DIAS, Math.max(1, Number(url.searchParams.get('dias')) || 30));
    const to = new Date();
    const from = new Date(to.getTime() - dias * 86400000);

    const [conversas, tarefas, metas, diretorio] = await Promise.all([
      carregarConversas(ctx, from, to),
      carregarTarefas(ctx, from, to),
      carregarMetas(ctx),
      carregarDiretorio(),
    ]);

    const avisos: string[] = [];
    const semAutoria = conversas.pessoas.find((p) => !p.agent_user_id);
    if (semAutoria && semAutoria.respostas > 0) {
      avisos.push(
        `${semAutoria.respostas.toLocaleString('pt-BR')} respostas do período não têm autor registrado. ` +
          'O sistema só passou a gravar quem respondeu a partir da atualização — o número por pessoa ' +
          'começa a encher agora e não dá para reconstruir o que passou.'
      );
    }
    if (tarefas.total === 0) {
      avisos.push('Nenhuma tarefa no período: as métricas de tarefa enchem conforme a equipe usar o quadro.');
    }

    return NextResponse.json({
      range: { from: from.toISOString(), to: to.toISOString(), days: dias },
      me: { userId: ctx.userId, fullName: ctx.fullName, isManager: ctx.isManager },
      members: ctx.isManager
        ? diretorio.members
        : diretorio.members.filter((m) => m.userId === ctx.userId),
      departments: diretorio.departments,
      conversations: ctx.isManager
        ? conversas
        : { ...conversas, pessoas: conversas.pessoas.filter((p) => p.agent_user_id === ctx.userId) },
      tasks: ctx.isManager
        ? tarefas
        : { ...tarefas, porPessoa: tarefas.porPessoa.filter((p) => p.userId === ctx.userId) },
      goals: metas,
      avisos,
    });
  } catch (err) {
    console.error('[API metrics] GET', err);
    return NextResponse.json({ error: 'Falha ao calcular as métricas' }, { status: 500 });
  }
}

const VAZIO: ConversationMetrics = {
  rodadas: 0,
  respondidas: 0,
  conversas: 0,
  p50: null,
  p90: null,
  diario: [],
  pessoas: [],
  mapa: [],
  departamentos: [],
};

async function carregarConversas(
  ctx: TeamContext,
  from: Date,
  to: Date
): Promise<ConversationMetrics> {
  const { data, error } = await supabaseAdmin.rpc('metrics_conversations', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_scope: ctx.scope,
    p_user: ctx.userId,
    p_departments: ctx.departmentIds,
  });

  if (error) {
    // Falta a migração 045 — o resto do painel (tarefas, metas) ainda funciona.
    console.error('[API metrics] metrics_conversations', error.message);
    return VAZIO;
  }
  return { ...VAZIO, ...(data as ConversationMetrics) };
}

async function carregarTarefas(ctx: TeamContext, from: Date, to: Date): Promise<TaskMetrics> {
  let query = supabaseAdmin
    .from('tasks')
    .select(
      'id, title, status, assigned_to, assigned_at, due_at, first_seen_at, completed_at, completed_by, created_at, department_id'
    )
    // Tarefa criada antes da janela mas ainda aberta continua sendo problema hoje,
    // então entra pelos dois lados: criada no período OU ainda em aberto.
    .or(`created_at.gte.${from.toISOString()},status.neq.closed`)
    .limit(5000);

  if (ctx.scope !== 'all') {
    query =
      ctx.scope === 'assigned'
        ? query.eq('assigned_to', ctx.userId)
        : query.or(
            `assigned_to.eq.${ctx.userId},department_id.is.null` +
              (ctx.departmentIds.length ? `,department_id.in.(${ctx.departmentIds.join(',')})` : '')
          );
  }

  const { data, error } = await query;
  if (error) {
    console.error('[API metrics] tasks', error.message);
    return vazioTarefas();
  }

  return agregarTarefas((data ?? []) as Task[], from, to);
}

function vazioTarefas(): TaskMetrics {
  return {
    total: 0,
    concluidas: 0,
    abertas: 0,
    atrasadas: 0,
    noPrazoPct: null,
    tempoSolucao: null,
    tempoAteVer: null,
    porStatus: {},
    porPessoa: [],
    diario: [],
    atencao: [],
  };
}

/** Folga antes de cobrar: tarefa recém-criada ainda não é abandono. */
const CARENCIA_S = 2 * 3600;
const VENCE_HOJE_S = 24 * 3600;
const MAX_ALERTAS = 12;

/**
 * Classifica uma tarefa aberta pelo motivo que exige atenção — ou null se está
 * em ordem. Um motivo por tarefa, o mais grave: quem está atrasado não precisa
 * ouvir também que ninguém abriu.
 */
function classificarAtencao(
  t: Task,
  agora: number
): { motivo: MotivoAtencao; segundos: number } | null {
  if (t.status === 'closed') return null;

  if (t.due_at) {
    const venc = new Date(t.due_at).getTime();
    if (venc < agora) return { motivo: 'atrasada', segundos: (agora - venc) / 1000 };
    if (venc - agora <= VENCE_HOJE_S * 1000) {
      return { motivo: 'vence_hoje', segundos: (venc - agora) / 1000 };
    }
  }

  if (t.assigned_to && !t.first_seen_at && t.assigned_at) {
    const parada = (agora - new Date(t.assigned_at).getTime()) / 1000;
    if (parada >= CARENCIA_S) return { motivo: 'nao_vista', segundos: parada };
  }

  if (!t.assigned_to) {
    const parada = (agora - new Date(t.created_at).getTime()) / 1000;
    if (parada >= CARENCIA_S) return { motivo: 'sem_dono', segundos: parada };
  }

  return null;
}

function agregarTarefas(tasks: Task[], from: Date, to: Date): TaskMetrics {
  const agora = to.getTime();
  const inicio = from.getTime();
  const out = vazioTarefas();

  const porPessoa = new Map<string | null, TaskAgentStats & { versao: number[]; solucao: number[] }>();
  const porDia = new Map<string, { concluidas: number; criadas: number }>();
  const solucoes: number[] = [];
  const versoes: number[] = [];
  const alertas: TaskAlert[] = [];
  let comPrazo = 0;
  let noPrazo = 0;

  const pessoa = (id: string | null) => {
    let p = porPessoa.get(id);
    if (!p) {
      p = {
        userId: id,
        criadas: 0,
        concluidas: 0,
        noPrazo: 0,
        comPrazo: 0,
        abertas: 0,
        atrasadas: 0,
        tempoAteVer: null,
        tempoSolucao: null,
        versao: [],
        solucao: [],
      };
      porPessoa.set(id, p);
    }
    return p;
  };

  const dia = (iso: string) => {
    const d = new Date(iso).toISOString().slice(0, 10);
    let v = porDia.get(d);
    if (!v) porDia.set(d, (v = { concluidas: 0, criadas: 0 }));
    return v;
  };

  for (const t of tasks) {
    out.total += 1;
    out.porStatus[t.status] = (out.porStatus[t.status] ?? 0) + 1;

    const dono = t.assigned_to ?? null;
    const p = pessoa(dono);
    p.criadas += 1;
    if (new Date(t.created_at).getTime() >= inicio) dia(t.created_at).criadas += 1;

    const concluida = t.status === 'closed' && !!t.completed_at;
    if (concluida) {
      out.concluidas += 1;
      p.concluidas += 1;
      dia(t.completed_at!).concluidas += 1;

      if (t.due_at) {
        comPrazo += 1;
        p.comPrazo += 1;
        if (new Date(t.completed_at!).getTime() <= new Date(t.due_at).getTime()) {
          noPrazo += 1;
          p.noPrazo += 1;
        }
      }
      // Conta a partir de quando caiu no nome de alguém; sem dono, da criação.
      const base = t.assigned_at ?? t.created_at;
      const seg = (new Date(t.completed_at!).getTime() - new Date(base).getTime()) / 1000;
      if (seg >= 0) {
        solucoes.push(seg);
        p.solucao.push(seg);
      }
    } else {
      out.abertas += 1;
      p.abertas += 1;
      if (t.due_at && new Date(t.due_at).getTime() < agora) {
        out.atrasadas += 1;
        p.atrasadas += 1;
      }

      const alerta = classificarAtencao(t, agora);
      if (alerta) {
        alertas.push({
          id: t.id,
          title: t.title,
          assignedTo: dono,
          dueAt: t.due_at ?? null,
          ...alerta,
        });
      }
    }

    if (t.assigned_at && t.first_seen_at) {
      const seg = (new Date(t.first_seen_at).getTime() - new Date(t.assigned_at).getTime()) / 1000;
      if (seg >= 0) {
        versoes.push(seg);
        p.versao.push(seg);
      }
    }
  }

  out.noPrazoPct = comPrazo ? (noPrazo / comPrazo) * 100 : null;
  out.tempoSolucao = median(solucoes);
  out.tempoAteVer = median(versoes);
  out.porPessoa = Array.from(porPessoa.values()).map(({ versao, solucao, ...rest }) => ({
    ...rest,
    tempoAteVer: median(versao),
    tempoSolucao: median(solucao),
  }));
  // Mais grave primeiro; dentro do mesmo motivo, o que está parado há mais tempo.
  // 'vence_hoje' inverte: o que vence antes vem primeiro.
  out.atencao = alertas
    .sort((a, b) => {
      const peso = PESO_ATENCAO[a.motivo] - PESO_ATENCAO[b.motivo];
      if (peso !== 0) return peso;
      return a.motivo === 'vence_hoje' ? a.segundos - b.segundos : b.segundos - a.segundos;
    })
    .slice(0, MAX_ALERTAS);

  out.diario = Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, v]) => ({ dia, ...v }));

  return out;
}

async function carregarMetas(ctx: TeamContext) {
  let query = supabaseAdmin
    .from('team_goals')
    .select('id, user_id, metric, period, target')
    .eq('active', true);
  if (!ctx.isManager) query = query.eq('user_id', ctx.userId);

  const { data, error } = await query;
  if (error) {
    console.error('[API metrics] goals', error.message);
    return [];
  }
  return data ?? [];
}

async function carregarDiretorio() {
  const [{ data: members }, { data: departments }] = await Promise.all([
    supabaseAdmin
      .from('team_members')
      .select('user_id, full_name')
      .eq('active', true)
      .order('full_name'),
    supabaseAdmin.from('sectors').select('id, name, color').eq('active', true).order('sort_order'),
  ]);

  return {
    members: (members ?? [])
      .filter((m): m is { user_id: string; full_name: string | null } => !!m.user_id)
      .map((m) => ({ userId: m.user_id, fullName: m.full_name })),
    departments: departments ?? [],
  };
}
