'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Merge, Sparkles, X } from 'lucide-react';

interface ReviewItem {
  id: string;
  conversation_id: string | null;
  brand: string;
  question_context: string;
  suggested_response: string | null;
  actual_response: string;
  proposed_question_pattern: string;
  proposed_gold_response: string;
  proposed_category: string;
  duplicate_of: string | null;
  duplicate_similarity: number | null;
  created_at: string;
  duplicate?: { id: string; question_pattern: string; gold_response: string; frequency: number } | null;
}

const CATEGORIAS = [
  'financeiro', 'acesso', 'matricula', 'academico', 'lead',
  'tecnico', 'duvida', 'reclamacao', 'documento', 'outro',
];

/**
 * Curadoria da base de conhecimento.
 *
 * Cada item aqui é uma correção real: a IA sugeriu uma coisa, o atendente enviou
 * outra. A tela mostra os dois lados porque é a diferença entre eles que carrega
 * o conhecimento — e mostra o texto proposto EDITÁVEL, porque o valor da
 * curadoria está em corrigir antes de aprovar, não em carimbar.
 */
export default function CuradoriaPage() {
  const [itens, setItens] = useState<ReviewItem[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, { p: string; r: string; c: string }>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch('/api/ia/kb-review', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Falha ao carregar');
      setItens(json.items ?? []);
      setPendentes(json.pending ?? 0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const rascunho = (i: ReviewItem) =>
    rascunhos[i.id] ?? {
      p: i.proposed_question_pattern,
      r: i.proposed_gold_response,
      c: i.proposed_category,
    };

  const editar = (id: string, campo: 'p' | 'r' | 'c', valor: string) =>
    setRascunhos((prev) => {
      const atual = prev[id] ?? {
        p: itens.find((i) => i.id === id)?.proposed_question_pattern ?? '',
        r: itens.find((i) => i.id === id)?.proposed_gold_response ?? '',
        c: itens.find((i) => i.id === id)?.proposed_category ?? 'outro',
      };
      return { ...prev, [id]: { ...atual, [campo]: valor } };
    });

  const revisar = async (item: ReviewItem, action: 'approve' | 'reject', forceNew = false) => {
    setSalvando(item.id);
    try {
      const d = rascunho(item);
      const res = await fetch('/api/ia/kb-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'approve'
            ? { id: item.id, action, questionPattern: d.p, goldResponse: d.r, category: d.c, forceNew }
            : { id: item.id, action }
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Falha');
      setItens((prev) => prev.filter((i) => i.id !== item.id));
      setPendentes((n) => Math.max(0, n - 1));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao revisar');
    } finally {
      setSalvando(null);
    }
  };

  const rotulo = 'block text-[10px] uppercase tracking-wider text-gray-500 mb-1';
  const campo =
    'w-full text-sm rounded-lg bg-white/5 border border-white/10 text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]';

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0a18]">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-5 space-y-5">
        <header>
          <Link
            href="/settings/ia"
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            IA Atendimento
          </Link>
          <h1 className="text-lg font-semibold text-white">Curadoria da base</h1>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-2xl">
            Toda vez que um atendente reescreve a sugestão, a correção vira uma proposta aqui.
            Aprovar coloca o texto na base e a IA passa a responder assim para todo mundo — por isso
            vale ler antes. Corrija o texto se precisar; ele é editável.
          </p>
        </header>

        {erro && (
          <p className="rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-xs text-red-300">
            {erro}
          </p>
        )}

        {carregando ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 text-[#8b5cf6] animate-spin" />
          </div>
        ) : !itens.length ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
            <Sparkles className="w-5 h-5 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nada para revisar agora.</p>
            <p className="text-xs text-gray-500 mt-1">
              Propostas aparecem aqui conforme a equipe corrigir as sugestões da IA.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              {pendentes} {pendentes === 1 ? 'proposta pendente' : 'propostas pendentes'}
              {itens.length < pendentes && ` · mostrando as ${itens.length} mais recentes`}
            </p>

            {itens.map((item) => {
              const d = rascunho(item);
              const ocupado = salvando === item.id;
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-4"
                >
                  {/* O par original, para julgar com contexto */}
                  <div className="space-y-2">
                    <div>
                      <span className={rotulo}>O aluno disse</span>
                      <p className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-4">
                        {item.question_context}
                      </p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <span className={rotulo}>A IA sugeriu</span>
                        <p className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-5 rounded-lg bg-white/[0.03] p-2">
                          {item.suggested_response || '(sem sugestão registrada)'}
                        </p>
                      </div>
                      <div>
                        <span className={rotulo}>O atendente enviou</span>
                        <p className="text-xs text-emerald-200/80 whitespace-pre-wrap line-clamp-5 rounded-lg bg-emerald-500/[0.05] p-2">
                          {item.actual_response}
                        </p>
                      </div>
                    </div>
                  </div>

                  {item.duplicate && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3">
                      <p className="flex items-center gap-1.5 text-[11px] text-amber-200 mb-1">
                        <Merge className="w-3.5 h-3.5" />
                        Já existe entrada parecida
                        {item.duplicate_similarity != null &&
                          ` (${Math.round(item.duplicate_similarity * 100)}% igual, usada ${item.duplicate.frequency}×)`}
                        . Aprovar vai <strong>atualizar</strong> essa entrada, não criar outra.
                      </p>
                      <p className="text-[11px] text-gray-400 line-clamp-2">
                        {item.duplicate.question_pattern} → {item.duplicate.gold_response}
                      </p>
                    </div>
                  )}

                  {/* A proposta, editável */}
                  <div className="space-y-3 pt-1 border-t border-white/5">
                    <div>
                      <label className={rotulo} htmlFor={`p-${item.id}`}>
                        Pergunta-tipo (como outro aluno perguntaria)
                      </label>
                      <input
                        id={`p-${item.id}`}
                        value={d.p}
                        onChange={(e) => editar(item.id, 'p', e.target.value)}
                        className={campo}
                      />
                    </div>
                    <div>
                      <label className={rotulo} htmlFor={`r-${item.id}`}>
                        Resposta que a IA vai passar a dar
                      </label>
                      <textarea
                        id={`r-${item.id}`}
                        value={d.r}
                        onChange={(e) => editar(item.id, 'r', e.target.value)}
                        rows={4}
                        className={`${campo} resize-y`}
                      />
                    </div>
                    <div className="flex items-end justify-between gap-3 flex-wrap">
                      <div>
                        <label className={rotulo} htmlFor={`c-${item.id}`}>
                          Categoria
                        </label>
                        <select
                          id={`c-${item.id}`}
                          value={d.c}
                          onChange={(e) => editar(item.id, 'c', e.target.value)}
                          className="text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]"
                        >
                          {CATEGORIAS.map((c) => (
                            <option key={c} value={c} className="bg-[#1a1a2e]">
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => void revisar(item, 'reject')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          Descartar
                        </button>
                        {item.duplicate && (
                          <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => void revisar(item, 'approve', true)}
                            className="px-3 py-1.5 rounded-lg text-xs text-gray-300 bg-white/[0.06] hover:bg-white/10 disabled:opacity-50"
                          >
                            Criar entrada nova
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => void revisar(item, 'approve')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#8b5cf6] text-white hover:bg-[#7c4ef3] disabled:opacity-50"
                        >
                          {ocupado ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          {item.duplicate ? 'Atualizar entrada' : 'Aprovar'}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
