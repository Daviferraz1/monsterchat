'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  EyeOff,
  Info,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  Target,
  UserX,
} from 'lucide-react';
import { useMetrics } from '@/hooks/useMetrics';
import { Anel, Barras, BarraDeRaias, GraficoEspera, MapaDeCalor } from '@/components/metrics/charts';
import {
  formatDuration,
  formatMetric,
  goalProgress,
  METRICS,
  periodElapsed,
  type GoalPeriod,
  type MetricKey,
  type MetricsResponse,
  type MotivoAtencao,
  type TaskAlert,
} from '@/lib/metrics';

const PERIODOS = [
  { dias: 7, label: '7 dias' },
  { dias: 30, label: '30 dias' },
  { dias: 90, label: '90 dias' },
];

const RAIAS = [
  { status: 'open', label: 'A fazer', cor: '#64748b' },
  { status: 'pending', label: 'Em andamento', cor: '#8b5cf6' },
  { status: 'snoozed', label: 'Aguardando', cor: '#f59e0b' },
  { status: 'closed', label: 'Concluída', cor: '#10b981' },
];

/**
 * Painel de desempenho.
 *
 * A tela é organizada de fora para dentro: primeiro o que exige ação hoje
 * (pergunta no vácuo, tarefa vencida), depois a tendência, e só no fim a
 * comparação entre pessoas. Ranking em cima transformaria o painel num quadro de
 * cobrança; a fila esquecida é o que realmente custa aluno.
 */
export default function PainelPage() {
  const [dias, setDias] = useState(30);
  const [pessoa, setPessoa] = useState('todos');
  const { data, loading, erro, recarregar, salvarMeta } = useMetrics(dias);

  const alvo = data?.me.isManager ? pessoa : data?.me.userId ?? 'todos';
  const numeros = useMemo(() => (data ? extrairNumeros(data, alvo) : null), [data, alvo]);

  if (loading && !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#8b5cf6] animate-spin" />
      </div>
    );
  }

  if (erro || !data || !numeros) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm text-gray-400">{erro ?? 'Não foi possível carregar o painel.'}</p>
        <button
          type="button"
          onClick={() => void recarregar()}
          className="text-xs text-[#a78bfa] hover:underline"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const semResposta = data.conversations.rodadas - data.conversations.respondidas;
  const nomePessoa = (id: string | null) =>
    data.members.find((m) => m.userId === id)?.fullName ?? 'Sem autor registrado';

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a18]">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* Cabeçalho */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-white">Painel de desempenho</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {alvo === 'todos'
                ? 'Números da equipe'
                : `Números de ${nomePessoa(alvo)}`}{' '}
              · últimos {dias} dias
            </p>
          </div>

          <div className="flex items-center gap-2">
            {data.me.isManager && data.members.length > 0 && (
              <select
                value={pessoa}
                onChange={(e) => setPessoa(e.target.value)}
                aria-label="Pessoa"
                className="text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
              >
                <option value="todos" className="bg-[#1a1a2e]">
                  Equipe toda
                </option>
                {data.members.map((m) => (
                  <option key={m.userId} value={m.userId} className="bg-[#1a1a2e]">
                    {m.fullName ?? 'Sem nome'}
                  </option>
                ))}
              </select>
            )}

            <div className="flex rounded-lg bg-white/5 border border-white/10 p-0.5">
              {PERIODOS.map((p) => (
                <button
                  key={p.dias}
                  type="button"
                  onClick={() => setDias(p.dias)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    dias === p.dias ? 'bg-[#8b5cf6] text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void recarregar()}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Recarregar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        <AvisoDeAtencao
          alertas={
            alvo === 'todos'
              ? data.tasks.atencao
              : data.tasks.atencao.filter((a) => a.assignedTo === alvo)
          }
          nomePessoa={nomePessoa}
          mostrarDono={alvo === 'todos'}
        />

        {/* O que precisa de ação hoje */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Cartao
            icone={MessageSquareWarning}
            tom={semResposta > 0 ? 'alerta' : 'ok'}
            valor={formatMetric(semResposta, 'count')}
            label="Perguntas sem resposta"
            detalhe={
              data.conversations.rodadas
                ? `${Math.round((data.conversations.respondidas / data.conversations.rodadas) * 100)}% respondidas`
                : 'sem perguntas no período'
            }
            href="/inbox"
          />
          <Cartao
            icone={Clock}
            tom="neutro"
            valor={formatDuration(numeros.p50)}
            label="Espera até a resposta"
            detalhe={`mediana · p90 ${formatDuration(numeros.p90)}`}
          />
          <Cartao
            icone={AlertTriangle}
            tom={data.tasks.atrasadas > 0 ? 'alerta' : 'ok'}
            valor={formatMetric(numeros.tarefasAtrasadas, 'count')}
            label="Tarefas atrasadas"
            detalhe={`${numeros.tarefasAbertas} em aberto`}
            href="/quadro"
          />
          <Cartao
            icone={CheckCircle2}
            tom="ok"
            valor={formatMetric(numeros.tarefasConcluidas, 'count')}
            label="Tarefas concluídas"
            detalhe={
              numeros.noPrazoPct != null
                ? `${Math.round(numeros.noPrazoPct)}% no prazo`
                : 'nenhuma com prazo ainda'
            }
            href="/quadro"
          />
        </section>

        {/* Avisos de buraco no dado — melhor dizer que o número não existe do
            que deixar a pessoa ler zero como desempenho zero. */}
        {data.avisos.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 space-y-1.5">
            {data.avisos.map((a) => (
              <p key={a} className="flex gap-2 text-[11px] text-amber-200/80 leading-relaxed">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{a}</span>
              </p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Painel titulo="Espera até a resposta, dia a dia" className="xl:col-span-2"
            legenda="A linha é a mediana. A sombra vai até o p90 — quando ela abre, alguém ficou muito tempo esperando.">
            <GraficoEspera dados={data.conversations.diario} />
          </Painel>

          <Painel titulo="Metas" icone={Target}
            legenda={data.me.isManager ? 'Clique no valor para ajustar o alvo.' : undefined}>
            <ListaDeMetas
              data={data}
              alvo={alvo}
              numeros={numeros}
              onSalvar={salvarMeta}
            />
          </Painel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Painel titulo="Quando chega e quando espera" className="xl:col-span-2"
            legenda="Cruze as duas lentes: onde chega muita pergunta e a espera é alta, falta gente naquele horário.">
            <MapaDeCalor celulas={data.conversations.mapa} />
          </Painel>

          <div className="space-y-4">
            <Painel titulo="Estado das tarefas">
              <BarraDeRaias
                segmentos={RAIAS.map((r) => ({
                  label: r.label,
                  valor: data.tasks.porStatus[r.status] ?? 0,
                  cor: r.cor,
                }))}
              />
              <dl className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-gray-500">Tempo até ver</dt>
                  <dd className="text-sm text-gray-200 mt-0.5">
                    {formatDuration(data.tasks.tempoAteVer)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-gray-500">Tempo de solução</dt>
                  <dd className="text-sm text-gray-200 mt-0.5">
                    {formatDuration(data.tasks.tempoSolucao)}
                  </dd>
                </div>
              </dl>
            </Painel>

            <Painel titulo="Por departamento">
              <Barras
                vazio="Nenhuma conversa com departamento definido no período."
                itens={data.conversations.departamentos
                  .filter((d) => d.department_id)
                  .map((d) => ({
                    label: data.departments.find((x) => x.id === d.department_id)?.name ?? 'Outro',
                    valor: d.rodadas,
                    detalhe: `${d.rodadas} · ${formatDuration(d.p50)}`,
                  }))
                  .sort((a, b) => b.valor - a.valor)}
              />
            </Painel>
          </div>
        </div>

        {data.me.isManager && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Painel titulo="Respostas por pessoa"
              legenda="Conta a rodada que a pessoa fechou. Barra sem nome é resposta anterior ao registro de autoria.">
              <Barras
                vazio="Ainda sem resposta com autor registrado."
                itens={data.conversations.pessoas
                  .map((p) => ({
                    label: nomePessoa(p.agent_user_id),
                    valor: p.respostas,
                    detalhe: `${p.respostas} · ${formatDuration(p.p50)}`,
                    destaque: p.agent_user_id === data.me.userId,
                  }))
                  .sort((a, b) => b.valor - a.valor)}
              />
            </Painel>

            <Painel titulo="Tarefas por pessoa"
              legenda="Concluídas no período, com o tempo mediano da atribuição até a conclusão.">
              <Barras
                vazio="Nenhuma tarefa atribuída ainda."
                itens={data.tasks.porPessoa
                  .map((p) => ({
                    label: nomePessoa(p.userId),
                    valor: p.concluidas,
                    detalhe: `${p.concluidas} concl. · ${p.abertas} abertas${
                      p.atrasadas ? ` · ${p.atrasadas} atrasadas` : ''
                    }`,
                    destaque: p.userId === data.me.userId,
                  }))
                  .sort((a, b) => b.valor - a.valor)}
              />
            </Painel>
          </div>
        )}
      </div>
    </div>
  );
}

// --- blocos ----------------------------------------------------------------

const MOTIVOS: Record<
  MotivoAtencao,
  { label: string; icone: React.ComponentType<{ className?: string }>; cor: string; frase: (s: number) => string }
> = {
  atrasada: {
    label: 'Atrasada',
    icone: AlertTriangle,
    cor: 'text-red-400',
    frase: (s) => `venceu há ${formatDuration(s)}`,
  },
  vence_hoje: {
    label: 'Vence hoje',
    icone: Clock,
    cor: 'text-amber-400',
    frase: (s) => `faltam ${formatDuration(s)}`,
  },
  nao_vista: {
    label: 'Não aberta',
    icone: EyeOff,
    cor: 'text-amber-400',
    frase: (s) => `atribuída há ${formatDuration(s)} e ninguém abriu`,
  },
  sem_dono: {
    label: 'Sem dono',
    icone: UserX,
    cor: 'text-gray-400',
    frase: (s) => `parada na fila há ${formatDuration(s)}`,
  },
};

const VISIVEIS = 5;

/**
 * O aviso que abre o painel.
 *
 * Fica acima de tudo porque é a única parte da tela que pede ação hoje — o resto
 * é leitura. E lista tarefa por tarefa em vez de só contar: "3 tarefas
 * precisam de atenção" faz a pessoa procurar quais são; com o nome na frente ela
 * clica e resolve.
 */
function AvisoDeAtencao({
  alertas,
  nomePessoa,
  mostrarDono,
}: {
  alertas: TaskAlert[];
  nomePessoa: (id: string | null) => string;
  mostrarDono: boolean;
}) {
  const [expandido, setExpandido] = useState(false);

  if (!alertas.length) {
    return (
      <p className="flex items-center gap-2 text-[11px] text-emerald-400/70">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Nenhuma tarefa fora do prazo ou parada sem dono.
      </p>
    );
  }

  const atrasadas = alertas.filter((a) => a.motivo === 'atrasada').length;
  const mostrar = expandido ? alertas : alertas.slice(0, VISIVEIS);
  const grave = atrasadas > 0;

  return (
    <section
      className={`rounded-xl border p-4 ${
        grave ? 'border-red-500/25 bg-red-500/[0.06]' : 'border-amber-500/25 bg-amber-500/[0.06]'
      }`}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className={`text-sm font-medium ${grave ? 'text-red-300' : 'text-amber-200'}`}>
          {alertas.length === 1
            ? '1 tarefa precisa de atenção'
            : `${alertas.length} tarefas precisam de atenção`}
          {atrasadas > 0 && (
            <span className="font-normal opacity-80">
              {' '}
              · {atrasadas} {atrasadas === 1 ? 'já venceu' : 'já venceram'}
            </span>
          )}
        </h2>
        <Link
          href="/quadro"
          className="shrink-0 inline-flex items-center gap-1 text-[11px] text-gray-300 hover:text-white transition-colors"
        >
          Abrir tarefas
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <ul className="space-y-1.5">
        {mostrar.map((a) => {
          const m = MOTIVOS[a.motivo];
          const Icone = m.icone;
          return (
            <li key={a.id}>
              <Link
                href="/quadro"
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 hover:bg-white/[0.04] transition-colors"
              >
                <Icone className={`w-3.5 h-3.5 shrink-0 ${m.cor}`} />
                <span className="text-xs text-gray-200 truncate flex-1 min-w-0">{a.title}</span>
                {mostrarDono && (
                  <span className="text-[10px] text-gray-500 shrink-0 hidden sm:inline truncate max-w-[120px]">
                    {a.assignedTo ? nomePessoa(a.assignedTo) : 'sem dono'}
                  </span>
                )}
                <span className={`text-[10px] shrink-0 ${m.cor}`}>{m.frase(a.segundos)}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {alertas.length > VISIVEIS && (
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className="mt-2 text-[11px] text-gray-400 hover:text-white transition-colors"
        >
          {expandido ? 'mostrar menos' : `mostrar as outras ${alertas.length - VISIVEIS}`}
        </button>
      )}
    </section>
  );
}

interface NumerosPessoa {
  respostas: number;
  conversas: number;
  p50: number | null;
  p90: number | null;
  taxaResposta: number | null;
  tarefasConcluidas: number;
  tarefasAbertas: number;
  tarefasAtrasadas: number;
  noPrazoPct: number | null;
  tempoSolucao: number | null;
}

/** Recorta os números do alvo escolhido — uma pessoa ou a equipe inteira. */
function extrairNumeros(data: MetricsResponse, alvo: string): NumerosPessoa {
  const c = data.conversations;
  const t = data.tasks;
  const taxa = c.rodadas ? (c.respondidas / c.rodadas) * 100 : null;

  if (alvo === 'todos') {
    return {
      respostas: c.respondidas,
      conversas: c.conversas,
      p50: c.p50,
      p90: c.p90,
      taxaResposta: taxa,
      tarefasConcluidas: t.concluidas,
      tarefasAbertas: t.abertas,
      tarefasAtrasadas: t.atrasadas,
      noPrazoPct: t.noPrazoPct,
      tempoSolucao: t.tempoSolucao,
    };
  }

  const p = c.pessoas.find((x) => x.agent_user_id === alvo);
  const tp = t.porPessoa.find((x) => x.userId === alvo);
  return {
    respostas: p?.respostas ?? 0,
    conversas: p?.conversas ?? 0,
    p50: p?.p50 ?? null,
    p90: p?.p90 ?? null,
    // A taxa segue sendo da fila: uma pergunta que ninguém respondeu não tem
    // dono para responsabilizar, então não faz sentido dividir por pessoa.
    taxaResposta: taxa,
    tarefasConcluidas: tp?.concluidas ?? 0,
    tarefasAbertas: tp?.abertas ?? 0,
    tarefasAtrasadas: tp?.atrasadas ?? 0,
    noPrazoPct: tp && tp.comPrazo ? (tp.noPrazo / tp.comPrazo) * 100 : null,
    tempoSolucao: tp?.tempoSolucao ?? null,
  };
}

function valorDaMetrica(key: MetricKey, n: NumerosPessoa): number | null {
  switch (key) {
    case 'conversations_handled':
      return n.conversas;
    case 'answers_sent':
      return n.respostas;
    case 'first_response_p50':
      return n.p50;
    case 'reply_rate':
      return n.taxaResposta;
    case 'tasks_completed':
      return n.tarefasConcluidas;
    case 'tasks_on_time_rate':
      return n.noPrazoPct;
    case 'task_resolution_p50':
      return n.tempoSolucao;
  }
}

function ListaDeMetas({
  data,
  alvo,
  numeros,
  onSalvar,
}: {
  data: MetricsResponse;
  alvo: string;
  numeros: NumerosPessoa;
  onSalvar: (u: string, m: MetricKey, p: GoalPeriod, t: number | null) => Promise<void>;
}) {
  const [editando, setEditando] = useState<MetricKey | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (alvo === 'todos') {
    return (
      <p className="text-xs text-gray-500 leading-relaxed">
        Meta é combinada com uma pessoa, não com o time. Escolha alguém no seletor acima para ver e
        ajustar os alvos.
      </p>
    );
  }

  const metas = data.goals.filter((g) => g.user_id === alvo);
  const podeEditar = data.me.isManager;

  const confirmar = async (key: MetricKey, period: GoalPeriod) => {
    const valor = rascunho.trim() === '' ? null : Number(rascunho.replace(',', '.'));
    if (valor != null && !Number.isFinite(valor)) return;
    setSalvando(true);
    try {
      await onSalvar(alvo, key, period, valor);
      setEditando(null);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3">
      {METRICS.map((m) => {
        const meta = metas.find((g) => g.metric === m.key);
        const atual = valorDaMetrica(m.key, numeros);
        const progresso = meta ? goalProgress(atual, meta.target, m.direction) : null;
        const ritmo = meta ? periodElapsed(meta.period) : 0;
        const cor =
          progresso?.state === 'ok' ? '#10b981' : progresso?.state === 'perto' ? '#f59e0b' : '#8b5cf6';

        return (
          <div key={m.key} className="flex items-center gap-3">
            {progresso ? (
              <div className="relative shrink-0">
                <Anel ratio={progresso.ratio} cor={cor} tamanho={44} />
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-gray-200 tabular-nums">
                  {Math.round(progresso.ratio * 100)}%
                </span>
              </div>
            ) : (
              <div className="w-11 h-11 shrink-0 rounded-full border border-dashed border-white/10" />
            )}

            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-300 truncate" title={m.help}>
                {m.label}
              </p>
              <p className="text-[11px] text-gray-500">
                <span className="text-gray-300 font-medium">{formatMetric(atual, m.unit)}</span>
                {meta ? ` de ${formatMetric(meta.target, m.unit)}` : ' · sem meta'}
                {meta && progresso && progresso.state !== 'ok' && ritmo > 0.15 && (
                  <span className={progresso.ratio < ritmo ? 'text-amber-400/80' : ''}>
                    {' '}
                    · {Math.round(ritmo * 100)}% do período
                  </span>
                )}
              </p>
            </div>

            {podeEditar &&
              (editando === m.key ? (
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    autoFocus
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void confirmar(m.key, meta?.period ?? 'monthly');
                      if (e.key === 'Escape') setEditando(null);
                    }}
                    placeholder={m.unit === 'seconds' ? 'segundos' : String(m.suggested)}
                    className="w-20 text-[11px] rounded-md bg-white/5 border border-white/10 text-gray-200 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
                  />
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => void confirmar(m.key, meta?.period ?? 'monthly')}
                    className="text-[11px] text-[#a78bfa] hover:underline disabled:opacity-50"
                  >
                    ok
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditando(m.key);
                    setRascunho(meta ? String(meta.target) : '');
                  }}
                  className="shrink-0 text-[11px] text-gray-500 hover:text-[#a78bfa] transition-colors"
                >
                  {meta ? 'ajustar' : 'definir'}
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function Painel({
  titulo,
  legenda,
  icone: Icone,
  className = '',
  children,
}: {
  titulo: string;
  legenda?: string;
  icone?: React.ComponentType<{ className?: string }>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-1">
        {Icone && <Icone className="w-3.5 h-3.5 text-gray-500" />}
        <h2 className="text-sm font-medium text-gray-200">{titulo}</h2>
      </div>
      {legenda && <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">{legenda}</p>}
      <div className={legenda ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

function Cartao({
  icone: Icone,
  valor,
  label,
  detalhe,
  tom,
  href,
}: {
  icone: React.ComponentType<{ className?: string }>;
  valor: string;
  label: string;
  detalhe: string;
  tom: 'alerta' | 'ok' | 'neutro';
  href?: string;
}) {
  const cor =
    tom === 'alerta' ? 'text-amber-400' : tom === 'ok' ? 'text-emerald-400' : 'text-[#a78bfa]';

  const conteudo = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400 truncate">{label}</span>
        <Icone className={`w-4 h-4 shrink-0 ${cor}`} />
      </div>
      <p className="text-2xl font-semibold text-white mt-2 tabular-nums">{valor}</p>
      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{detalhe}</p>
    </>
  );

  const classe =
    'rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition-colors' +
    (href ? ' hover:bg-white/[0.04] hover:border-white/10' : '');

  return href ? (
    <Link href={href} className={`block ${classe}`}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}
