'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronLeft, Loader2, Search, Plus, Pencil, Trash2 } from 'lucide-react';

const BRANDS = [
  { value: '', label: 'Todas as marcas' },
  { value: 'monster', label: 'Monster' },
  { value: 'fagenius', label: 'FAGENIUS' },
  { value: 'both', label: 'Ambas' },
];

const BRAND_OPTIONS = BRANDS.filter((b) => b.value);

const CATEGORIES = [
  'financeiro',
  'acesso',
  'matricula',
  'academico',
  'lead',
  'tecnico',
  'duvida',
  'reclamacao',
  'documento',
  'outro',
];

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

const emptyForm = {
  brand: 'both' as const,
  category: 'outro',
  question_pattern: '',
  gold_response: '',
  frequency: 1,
  is_active: true,
  tags: [] as string[],
};

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<'create' | KnowledgeEntry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (search) params.set('search', search);
      if (brand) params.set('brand', brand);
      if (category) params.set('category', category);
      if (includeInactive) params.set('includeInactive', 'true');
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
  }, [page, pageSize, search, brand, category, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm);
    setSaveError(null);
    setModalOpen('create');
  };

  const openEdit = (entry: KnowledgeEntry) => {
    setForm({
      brand: (BRAND_OPTIONS.some((b) => b.value === entry.brand) ? entry.brand : 'both') as 'monster' | 'fagenius' | 'both',
      category: CATEGORIES.includes(entry.category) ? entry.category : 'outro',
      question_pattern: entry.question_pattern,
      gold_response: entry.gold_response,
      frequency: entry.frequency,
      is_active: entry.is_active,
      tags: entry.tags ?? [],
    });
    setSaveError(null);
    setModalOpen(entry);
  };

  const closeModal = () => {
    setModalOpen(null);
    setSaveError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (!form.question_pattern.trim() || !form.gold_response.trim()) {
      setSaveError('Pergunta e resposta são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      if (modalOpen === 'create') {
        const res = await fetch('/api/ia/knowledge-base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Falha ao criar');
        closeModal();
        load();
      } else if (modalOpen && typeof modalOpen === 'object' && modalOpen.id) {
        const res = await fetch(`/api/ia/knowledge-base/${modalOpen.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Falha ao atualizar');
        closeModal();
        load();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: KnowledgeEntry) => {
    if (!confirm(`Excluir esta entrada?\n"${entry.question_pattern.slice(0, 60)}..."\n\nA entrada será desativada (não aparecerá nas sugestões).`)) return;
    try {
      const res = await fetch(`/api/ia/knowledge-base/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao excluir');
      }
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const isEdit = modalOpen !== null && modalOpen !== 'create' && typeof modalOpen === 'object';

  return (
    <div className="min-h-full bg-gray-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
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
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#7c3aed] text-white font-medium text-sm hover:bg-[#6d28d9] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova entrada
          </button>
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
            {BRANDS.map((b) => (
              <option key={b.value || 'all'} value={b.value}>
                {b.label}
              </option>
            ))}
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
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => {
                setIncludeInactive(e.target.checked);
                setPage(1);
              }}
              className="rounded border-gray-300 text-[#7c3aed] focus:ring-[#7c3aed]"
            />
            Incluir inativas
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-600">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-600">
            {includeInactive
              ? 'Nenhuma entrada encontrada.'
              : 'Nenhuma entrada ativa na base. Cadastre uma nova entrada ou marque "Incluir inativas" para ver as desativadas.'}
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
                  className={`rounded-xl border overflow-hidden ${entry.is_active ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-gray-100 opacity-80'}`}
                >
                  <div className="flex flex-wrap items-center gap-2 p-4">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className="text-left flex-1 min-w-0 flex flex-wrap items-center gap-2 hover:bg-gray-100 rounded transition-colors -m-2 p-2"
                    >
                      <span className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                        {entry.brand}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                        {entry.category}
                      </span>
                      {!entry.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          Inativa
                        </span>
                      )}
                      <span className="text-xs text-gray-600">
                        {entry.frequency}x
                      </span>
                      <span className="text-gray-900 font-medium flex-1 min-w-0">
                        {entry.question_pattern}
                      </span>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(entry)}
                        className="p-2 rounded-lg text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry)}
                        className="p-2 rounded-lg text-gray-600 hover:bg-red-100 hover:text-red-700 transition-colors"
                        title="Excluir (desativar)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
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

      {/* Modal Criar / Editar */}
      {modalOpen !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeModal}>
          <div
            className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">
                {isEdit ? 'Editar entrada' : 'Nova entrada'}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {saveError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {saveError}
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                <select
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value as 'monster' | 'fagenius' | 'both' }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-[#7c3aed] text-sm"
                >
                  {BRAND_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-[#7c3aed] text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pergunta / padrão *</label>
                <input
                  type="text"
                  value={form.question_pattern}
                  onChange={(e) => setForm((f) => ({ ...f, question_pattern: e.target.value }))}
                  placeholder="Ex: Qual o valor do curso?"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#7c3aed] text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resposta sugerida (ouro) *</label>
                <textarea
                  value={form.gold_response}
                  onChange={(e) => setForm((f) => ({ ...f, gold_response: e.target.value }))}
                  placeholder="Texto que o atendente pode usar ou adaptar"
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-[#7c3aed] text-sm resize-y"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frequência</label>
                  <input
                    type="number"
                    min={0}
                    value={form.frequency}
                    onChange={(e) => setForm((f) => ({ ...f, frequency: parseInt(e.target.value, 10) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:ring-2 focus:ring-[#7c3aed] text-sm"
                  />
                </div>
                {isEdit && (
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer self-end pb-2">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="rounded border-gray-300 text-[#7c3aed] focus:ring-[#7c3aed]"
                    />
                    Ativa
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-[#7c3aed] text-white font-medium text-sm hover:bg-[#6d28d9] disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isEdit ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
