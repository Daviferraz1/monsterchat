'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Zap, Search, MessageCircle, ExternalLink, RefreshCw } from 'lucide-react';
import type { AutomacaoLead } from '@/types';
import { startPolling } from '@/lib/polling';

type Situacao = 'todos' | 'aguardando' | 'responderam' | 'falhas';
type Capa = { permalink?: string; thumbnail_url?: string; media_url?: string; media_type?: string };

const SITUACOES: { id: Situacao; rotulo: string; dica: string }[] = [
  { id: 'aguardando', rotulo: 'Aguardando resposta', dica: 'Receberam o link e ainda não responderam no direct' },
  { id: 'responderam', rotulo: 'Responderam', dica: 'Já estão na caixa de entrada' },
  { id: 'falhas', rotulo: 'Não enviados', dica: 'A Meta recusou ou o comentário passou de 7 dias' },
  { id: 'todos', rotulo: 'Todos', dica: '' },
];

function quando(iso: string) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function capaDe(c?: Capa) {
  if (!c) return undefined;
  return c.media_type === 'VIDEO' ? c.thumbnail_url : c.media_url || c.thumbnail_url;
}

export default function AutomacoesPage() {
  const [situacao, setSituacao] = useState<Situacao>('aguardando');
  const [dias, setDias] = useState(7);
  const [busca, setBusca] = useState('');
  const [leads, setLeads] = useState<AutomacaoLead[]>([]);
  const [contagem, setContagem] = useState<Record<Situacao, number>>({ todos: 0, aguardando: 0, responderam: 0, falhas: 0 });
  const [posts, setPosts] = useState<Record<string, Capa>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(
    async (mostrar = true) => {
      if (mostrar) setCarregando(true);
      try {
        const r = await fetch(`/api/automacoes/leads?dias=${dias}&situacao=${situacao}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Não foi possível carregar.');
        setLeads(d.leads);
        setContagem(d.contagem);
        setPosts(d.posts ?? {});
        setErro(null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      } finally {
        setCarregando(false);
      }
    },
    [dias, situacao]
  );

  useEffect(() => {
    carregar(true);
    return startPolling(() => carregar(false), 30_000);
  }, [carregar]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase().replace(/^@/, '');
    if (!q) return leads;
    return leads.filter(
      (l) =>
        (l.username ?? '').toLowerCase().includes(q) ||
        (l.comment_text ?? '').toLowerCase().includes(q) ||
        (l.palavra ?? '').toLowerCase().includes(q) ||
        (l.regra?.nome ?? '').toLowerCase().includes(q)
    );
  }, [leads, busca]);

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full min-h-0 overflow-auto bg-[#0d0d1a]">
      <div className="flex flex-col flex-1 min-w-0 w-full p-4 sm:p-6 max-w-5xl">
        <div className="flex items-center gap-2 mb-1 shrink-0">
          <Zap className="w-6 h-6 text-[#a78bfa]" />
          <h1 className="text-2xl font-bold text-white">Automações</h1>
        </div>
        <p className="text-sm text-gray-500 mb-4 shrink-0">
          Leads que comentaram uma palavra-chave no Instagram e receberam o link no direct. Quem responder vai para a
          caixa de entrada; para puxar alguém antes, abra a conversa e escreva.
        </p>

        <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Situação">
          {SITUACOES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={situacao === s.id}
              title={s.dica}
              onClick={() => setSituacao(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                situacao === s.id ? 'bg-[rgba(139,92,246,0.2)] text-[#c4b5fd]' : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]'
              }`}
            >
              {s.rotulo}
              <span className="tabular-nums text-xs rounded-full bg-white/10 px-1.5 py-0.5">{contagem[s.id]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden />
            <label htmlFor="automacoes-busca" className="sr-only">
              Buscar lead
            </label>
            <input
              id="automacoes-busca"
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por @, comentário ou palavra-chave"
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50"
            />
          </div>
          <label htmlFor="automacoes-periodo" className="sr-only">
            Período
          </label>
          <select
            id="automacoes-periodo"
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className="pl-3 pr-8 py-2 rounded-lg text-sm bg-[#1a1a2e] border border-white/20 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50"
          >
            <option value={1}>Hoje (24 h)</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button
            onClick={() => carregar(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-300 bg-white/5 hover:bg-white/10"
          >
            <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <Link href="/settings/instagram" className="text-sm text-[#a78bfa] hover:underline ml-auto">
            Regras de palavra-chave →
          </Link>
        </div>

        {erro && <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{erro}</div>}

        {carregando && leads.length === 0 ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-gray-400">
            Nenhum lead nesta situação no período.
          </div>
        ) : (
          <ul className="rounded-xl border border-white/10 bg-white/[0.03] divide-y divide-white/5">
            {visiveis.map((l) => {
              const capa = l.media_id ? posts[l.media_id] : undefined;
              const pendente = l.status === 'sent' && l.conversa?.automacao_pendente;
              return (
                <li key={l.id} className="flex gap-3 p-3 sm:p-4">
                  <a
                    href={capa?.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center"
                    title="Abrir o post"
                  >
                    {capaDe(capa) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={capaDe(capa)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <MessageCircle className="w-5 h-5 text-gray-500" />
                    )}
                  </a>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-white">{l.username ? `@${l.username}` : l.contato?.name ?? 'Instagram'}</span>
                      {l.palavra && (
                        <span className="text-[11px] font-mono uppercase bg-white/10 text-gray-200 px-1.5 py-0.5 rounded">{l.palavra}</span>
                      )}
                      {l.regra?.nome && <span className="text-xs text-gray-500">{l.regra.nome}</span>}
                      <span className="text-xs text-gray-500 ml-auto tabular-nums">{quando(l.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-300 mt-0.5 line-clamp-2">“{l.comment_text}”</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                      {l.status !== 'sent' ? (
                        <span className="rounded-full bg-red-500/15 text-red-300 px-2 py-0.5" title={l.error ?? ''}>
                          {l.status === 'expired' ? 'Não enviado: passou de 7 dias' : 'Não enviado'}
                        </span>
                      ) : pendente ? (
                        <span className="rounded-full bg-amber-500/15 text-amber-300 px-2 py-0.5">Link enviado · aguardando resposta</span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5">Na caixa de entrada</span>
                      )}
                      {l.conversa?.last_message_preview && !pendente && (
                        <span className="text-gray-500 truncate max-w-[260px]">{l.conversa.last_message_preview}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {l.conversation_id && (
                      <Link
                        href={`/inbox/${l.conversation_id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Abrir conversa
                      </Link>
                    )}
                    {capa?.permalink && (
                      <a
                        href={capa.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs text-gray-300"
                      >
                        <ExternalLink className="w-3 h-3" /> Post
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
