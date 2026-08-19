'use client';

import { useId, useMemo, useState } from 'react';
import { formatDuration } from '@/lib/metrics';

/**
 * Gráficos do painel, em SVG puro.
 *
 * Não entrou biblioteca de gráfico por dois motivos: nenhuma entrega de fábrica
 * a escala logarítmica com rótulo em unidade de tempo (1 min, 30 min, 2 h), que
 * é o que esses dados exigem; e o tema escuro do app teria que ser reescrito em
 * cima do tema padrão dela de qualquer jeito.
 */

const ROXO = '#8b5cf6';
const ROXO_CLARO = '#a78bfa';
const CINZA = '#6b7280';

/** Grade fixa em marcos que a equipe reconhece, não em potências de 10. */
const MARCOS = [
  { s: 60, label: '1 min' },
  { s: 300, label: '5 min' },
  { s: 1800, label: '30 min' },
  { s: 7200, label: '2 h' },
  { s: 43200, label: '12 h' },
  { s: 172800, label: '2 d' },
];

/**
 * Escala logarítmica.
 *
 * Numa escala linear a mediana (~4 min) encostaria no eixo e viraria uma linha
 * reta colada no zero, enquanto o p90 (~44 min) dominaria o desenho inteiro. Em
 * log as duas séries ficam legíveis lado a lado, que é o ponto do gráfico.
 */
function criarEscalaLog(maximo: number, altura: number, topo: number) {
  const teto = Math.max(maximo, 300);
  const min = Math.log(30);
  const max = Math.log(teto * 1.3);
  return (s: number) => {
    const v = Math.log(Math.max(30, s));
    return topo + altura - ((v - min) / (max - min)) * altura;
  };
}

interface SerieDia {
  dia: string;
  p50: number | null;
  p90: number | null;
  rodadas: number;
  respondidas: number;
}

/**
 * Espera por dia: linha da mediana com a faixa p50–p90 sombreada atrás.
 *
 * A faixa é o ponto do gráfico. Uma linha só de média esconderia que num dia
 * calmo a cauda estourou; aqui a faixa abre e o problema aparece.
 */
export function GraficoEspera({ dados }: { dados: SerieDia[] }) {
  const gradId = useId();
  const L = 52;
  const R = 12;
  const T = 12;
  const B = 26;
  const W = 760;
  const H = 220;
  const larg = W - L - R;
  const alt = H - T - B;

  const pontos = dados.filter((d) => d.p50 != null);
  const maximo = Math.max(...pontos.map((d) => d.p90 ?? d.p50 ?? 0), 600);
  const y = criarEscalaLog(maximo, alt, T);
  const x = (i: number) => L + (pontos.length === 1 ? larg / 2 : (i / (pontos.length - 1)) * larg);

  if (pontos.length < 2) {
    return <SemDados altura={H} texto="Ainda não há dias suficientes no período para desenhar a tendência." />;
  }

  const linha = pontos.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.p50!)}`).join(' ');
  const faixa =
    pontos.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.p50!)}`).join(' ') +
    ' ' +
    pontos
      .slice()
      .reverse()
      .map((d, i) => `L ${x(pontos.length - 1 - i)} ${y(d.p90 ?? d.p50!)}`)
      .join(' ') +
    ' Z';

  const marcos = MARCOS.filter((m) => m.s <= maximo * 1.3 && m.s >= 30);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label="Tempo de espera por dia: mediana e faixa até o percentil 90">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ROXO} stopOpacity="0.28" />
          <stop offset="100%" stopColor={ROXO} stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {marcos.map((m) => (
        <g key={m.s}>
          <line x1={L} y1={y(m.s)} x2={W - R} y2={y(m.s)} stroke="#ffffff" strokeOpacity="0.06" />
          <text x={L - 8} y={y(m.s) + 3.5} textAnchor="end" fontSize="10" fill={CINZA}>
            {m.label}
          </text>
        </g>
      ))}

      <path d={faixa} fill={`url(#${gradId})`} />
      <path d={linha} fill="none" stroke={ROXO_CLARO} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {pontos.map((d, i) => (
        <circle key={d.dia} cx={x(i)} cy={y(d.p50!)} r="2.5" fill={ROXO_CLARO}>
          <title>{`${diaCurto(d.dia)} · mediana ${formatDuration(d.p50)} · p90 ${formatDuration(d.p90)} · ${d.rodadas} perguntas`}</title>
        </circle>
      ))}

      {pontos.map((d, i) =>
        i % Math.ceil(pontos.length / 8) === 0 ? (
          <text key={d.dia} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill={CINZA}>
            {diaCurto(d.dia)}
          </text>
        ) : null
      )}
    </svg>
  );
}

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

interface Celula {
  dia_semana: number;
  hora: number;
  perguntas: number;
  respondidas: number;
  p50: number | null;
}

/**
 * Mapa de calor hora × dia da semana, com duas lentes.
 *
 * É o gráfico que responde "onde falta gente", que nenhum número isolado
 * responde: a lente de volume mostra quando o aluno escreve, a de espera mostra
 * quando ele fica esperando. Onde as duas acendem ao mesmo tempo, falta escala.
 */
export function MapaDeCalor({ celulas }: { celulas: Celula[] }) {
  const [lente, setLente] = useState<'volume' | 'espera'>('volume');

  const { grade, maxVolume, maxEspera } = useMemo(() => {
    const g = new Map<string, Celula>();
    let mv = 0;
    let me = 0;
    for (const c of celulas) {
      g.set(`${c.dia_semana}-${c.hora}`, c);
      mv = Math.max(mv, c.perguntas);
      if (c.p50 != null) me = Math.max(me, c.p50);
    }
    return { grade: g, maxVolume: mv, maxEspera: me };
  }, [celulas]);

  if (!celulas.length) {
    return <SemDados altura={200} texto="Sem perguntas no período." />;
  }

  const cor = (c: Celula | undefined) => {
    if (!c || !c.perguntas) return 'rgba(255,255,255,0.03)';
    if (lente === 'volume') {
      const t = Math.sqrt(c.perguntas / maxVolume); // raiz suaviza o pico e revela o meio
      return `rgba(139,92,246,${(0.08 + t * 0.85).toFixed(3)})`;
    }
    if (c.p50 == null) return 'rgba(255,255,255,0.05)';
    const t = Math.sqrt(c.p50 / Math.max(maxEspera, 1));
    // Verde para espera curta, âmbar no meio, vermelho na ponta.
    const h = 140 - t * 140;
    return `hsl(${h.toFixed(0)} 70% ${(52 - t * 12).toFixed(0)}% / ${(0.25 + t * 0.7).toFixed(2)})`;
  };

  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {(['volume', 'espera'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setLente(k)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              lente === k
                ? 'bg-[rgba(139,92,246,0.2)] text-[#a78bfa]'
                : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]'
            }`}
          >
            {k === 'volume' ? 'Quando o aluno escreve' : 'Quanto ele espera'}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div className="min-w-[560px]">
          <div className="flex">
            <div className="w-8 shrink-0" />
            <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="text-[8px] text-gray-600 text-center leading-none pb-1">
                  {h % 3 === 0 ? h : ''}
                </div>
              ))}
            </div>
          </div>
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
            <div key={dow} className="flex items-center mb-[2px]">
              <div className="w-8 shrink-0 text-[10px] text-gray-500 pr-1.5 text-right">
                {DIAS_SEMANA[dow]}
              </div>
              <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                {Array.from({ length: 24 }, (_, h) => {
                  const c = grade.get(`${dow}-${h}`);
                  return (
                    <div
                      key={h}
                      className="aspect-square rounded-[2px]"
                      style={{ backgroundColor: cor(c) }}
                      title={
                        c
                          ? `${DIAS_SEMANA[dow]} ${h}h · ${c.perguntas} perguntas · ${
                              c.perguntas - c.respondidas
                            } sem resposta · mediana ${formatDuration(c.p50)}`
                          : `${DIAS_SEMANA[dow]} ${h}h · sem movimento`
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-gray-500 mt-2">
        {lente === 'volume'
          ? 'Quanto mais forte, mais aluno escrevendo naquela hora.'
          : 'Verde responde rápido, vermelho deixa esperando.'}
      </p>
    </div>
  );
}

interface BarraItem {
  label: string;
  valor: number;
  /** Texto à direita da barra — costuma ser a métrica secundária. */
  detalhe?: string;
  destaque?: boolean;
}

/** Comparativo simples entre pessoas ou departamentos. */
export function Barras({ itens, vazio }: { itens: BarraItem[]; vazio: string }) {
  if (!itens.length) return <SemDados altura={120} texto={vazio} />;
  const max = Math.max(...itens.map((i) => i.valor), 1);

  return (
    <div className="space-y-2.5">
      {itens.map((i) => (
        <div key={i.label}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className={`text-xs truncate ${i.destaque ? 'text-[#a78bfa] font-medium' : 'text-gray-300'}`}>
              {i.label}
            </span>
            <span className="text-[11px] text-gray-500 shrink-0 tabular-nums">
              {i.detalhe ?? i.valor.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, (i.valor / max) * 100)}%`,
                background: i.destaque
                  ? 'linear-gradient(90deg,#8b5cf6,#a78bfa)'
                  : 'rgba(139,92,246,0.45)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Anel de progresso de meta. Passa de 100% quando bate. */
export function Anel({
  ratio,
  cor,
  tamanho = 64,
}: {
  ratio: number;
  cor: string;
  tamanho?: number;
}) {
  const r = tamanho / 2 - 5;
  const c = 2 * Math.PI * r;
  const preenchido = Math.min(1, ratio) * c;

  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden>
      <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
      <circle
        cx={tamanho / 2}
        cy={tamanho / 2}
        r={r}
        fill="none"
        stroke={cor}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${preenchido} ${c}`}
        transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
      />
    </svg>
  );
}

/** Distribuição das raias numa barra só — dá o formato da fila num relance. */
export function BarraDeRaias({
  segmentos,
}: {
  segmentos: { label: string; valor: number; cor: string }[];
}) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0);
  if (!total) return <SemDados altura={80} texto="Nenhuma tarefa no período." />;

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-white/[0.05]">
        {segmentos.map((s) =>
          s.valor ? (
            <div
              key={s.label}
              style={{ width: `${(s.valor / total) * 100}%`, backgroundColor: s.cor }}
              title={`${s.label}: ${s.valor}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {segmentos.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.cor }} />
            <span className="text-[11px] text-gray-400">{s.label}</span>
            <span className="text-[11px] text-gray-200 font-medium tabular-nums">{s.valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SemDados({ altura, texto }: { altura: number; texto: string }) {
  return (
    <div
      className="flex items-center justify-center text-center text-xs text-gray-500 px-6"
      style={{ minHeight: altura }}
    >
      {texto}
    </div>
  );
}

function diaCurto(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
