'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronLeft, Loader2, Search } from 'lucide-react';

interface KnowledgeEntry {
  id: string;
  brand: string;
  category: string;
  question_pattern: string;
  gold_response: string;
  frequency: number;
  is_active: boolean;
  tags: string[] | null;
  updated_at: string;
}

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search) params.set('search', search);
      if (brand) params.set('brand', brand);
      if (category) params.set('category', category);
      const res = await fetch(`/api/ia/knowledge-base?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [page, search, brand, category]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/settings/ia"
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-[#7c3aed]" />
            Base de conhecimento
          </h1>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar pergunta ou resposta..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent text-sm"
            />
          </div>
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] text-sm"
          >
            <option value="">Todas as marcas</option>
            <option value="monster">Monster</option>
            <option value="fagenius">FAGENIUS</option>
            <option value="both">Ambas</option>
          </select>
          <input
            type="text"
            placeholder="Categoria"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#7c3aed] text-sm w-40"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-600">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-600">
            Nenhuma entrada na base. Execute o script de análise (phase:all) no projeto ia-atendimento para gerar a base.
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-3">
              {total} entrada(s)
            </p>
            <div className="space-y-3">
              {items.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    className="w-full text-left p-4 flex flex-wrap items-center gap-2 hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                      {entry.brand}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                      {entry.category}
                    </span>
                    <span className="text-xs text-gray-600">
                      {entry.frequency}x
                    </span>
                    <span className="text-gray-900 font-medium flex-1 min-w-0">
                      {entry.question_pattern}
                    </span>
                  </button>
                  {expandedId === entry.id && (
                    <div className="px-4 pb-4 pt-0 border-t border-gray-200">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap mt-3">
                        {entry.gold_response}
                      </p>
                      {entry.tags?.length ? (
                        <p className="text-xs text-gray-600 mt-2">
                          Tags: {entry.tags.join(', ')}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 disabled:opacity-50 text-sm font-medium hover:bg-gray-50"
                >
                  Anterior
                </button>
                <span className="text-gray-600 text-sm">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 disabled:opacity-50 text-sm font-medium hover:bg-gray-50"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
