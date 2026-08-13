'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, Sparkles, Loader2, Trash2, Check, X, Pencil, Search, Eye } from 'lucide-react';

interface Evidence {
  sugerido?: string;
  enviado?: string;
  at?: string;
}

interface StyleLesson {
  id: string;
  brand: string;
  trigger_context: string;
  lesson: string;
  hits: number;
  is_active: boolean;
  evidence: Evidence[] | null;
  created_at: string;
  updated_at: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function EstiloPage() {
  const [lessons, setLessons] = useState<StyleLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; lesson: string; trigger: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ia/style');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
      setLessons(data.lessons ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
      setLessons([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((l) => `${l.trigger_context} ${l.lesson}`.toLowerCase().includes(q));
  }, [lessons, query]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch('/api/ia/style', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) throw new Error('Falha');
      setLessons((prev) =>
        prev.map((l) =>
          l.id === id
            ? {
                ...l,
                is_active: typeof body.isActive === 'boolean' ? body.isActive : l.is_active,
                lesson: typeof body.lesson === 'string' ? body.lesson : l.lesson,
                trigger_context: typeof body.triggerContext === 'string' ? body.triggerContext : l.trigger_context,
              }
            : l
        )
      );
    } catch {
      alert('Falha ao salvar a lição.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir esta lição? A IA deixa de segui-la nas próximas sugestões.')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/ia/style?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha');
      setLessons((prev) => prev.filter((l) => l.id !== id));
    } catch {
      alert('Falha ao excluir a lição.');
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { id, lesson, trigger } = editing;
    if (!lesson.trim()) return;
    await patch(id, { lesson: lesson.trim(), triggerContext: trigger.trim() || 'sempre' });
    setEditing(null);
  };

  const activeCount = lessons.filter((l) => l.is_active).length;

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-2">
          <Link
            href="/settings/ia"
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-[#7c3aed]" />
            Padrão do atendente
          </h1>
        </div>
        <p className="text-gray-600 text-sm mb-6">
          Quando o atendente responde diferente da sugestão, a IA compara as duas mensagens e registra aqui o padrão da
          equipe. As lições <strong>ativas</strong> entram no prompt da IA — as 12 mais reforçadas — então a próxima
          sugestão já sai nesse jeito. Desative ou corrija o que não fizer sentido.
        </p>

        <div className="relative mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por situação ou lição..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
          />
        </div>

        {error && (
          <p className="mb-3 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-600 py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {lessons.length === 0
              ? 'Nada aprendido ainda. Assim que o atendente enviar uma resposta diferente da sugestão, o padrão aparece aqui.'
              : 'Nenhuma lição corresponde ao filtro.'}
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">
              {filtered.length} {filtered.length === 1 ? 'lição' : 'lições'} · {activeCount}{' '}
              {activeCount === 1 ? 'ativa' : 'ativas'}
            </p>
            <ul className="space-y-3">
              {filtered.map((l) => {
                const isEditing = editing?.id === l.id;
                const evidence = Array.isArray(l.evidence) ? l.evidence : [];
                return (
                  <li
                    key={l.id}
                    className={`p-4 rounded-xl border ${
                      l.is_active ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50 opacity-70'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                            {l.trigger_context}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            {l.hits}x observado
                          </span>
                          {!l.is_active && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">desativada</span>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={editing.trigger}
                              onChange={(e) => setEditing({ ...editing, trigger: e.target.value })}
                              placeholder="Quando se aplica (ex.: preço do curso, sempre)"
                              maxLength={60}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-900"
                            />
                            <textarea
                              value={editing.lesson}
                              onChange={(e) => setEditing({ ...editing, lesson: e.target.value })}
                              rows={2}
                              maxLength={200}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-900"
                            />
                          </div>
                        ) : (
                          <p className="text-sm text-gray-800">{l.lesson}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">Atualizada em {formatDate(l.updated_at)}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={busyId === l.id}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] text-sm font-medium disabled:opacity-50"
                            >
                              {busyId === l.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                              Salvar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => patch(l.id, { isActive: !l.is_active })}
                              disabled={busyId === l.id}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium disabled:opacity-50"
                              title={l.is_active ? 'Desativar (a IA para de seguir)' : 'Ativar'}
                            >
                              {busyId === l.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : l.is_active ? (
                                <X className="w-4 h-4" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                              {l.is_active ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing({ id: l.id, lesson: l.lesson, trigger: l.trigger_context })}
                              className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {evidence.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                                className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                                title="Ver exemplos que geraram esta lição"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => remove(l.id)}
                              className="p-2 rounded-lg border border-gray-300 text-red-600 hover:bg-red-50"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {expanded === l.id && evidence.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                        {evidence.map((ev, i) => (
                          <div key={i} className="text-xs grid sm:grid-cols-2 gap-2">
                            <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                              <p className="text-gray-500 font-medium mb-0.5">A IA sugeriu</p>
                              <p className="text-gray-700 whitespace-pre-wrap">{ev.sugerido}</p>
                            </div>
                            <div className="p-2 rounded-lg bg-violet-50 border border-violet-200">
                              <p className="text-violet-700 font-medium mb-0.5">O atendente enviou</p>
                              <p className="text-gray-700 whitespace-pre-wrap">{ev.enviado}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
