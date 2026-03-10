'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  Package,
  Loader2,
  Plus,
  Pencil,
  Eye,
  Trash2,
  Check,
  X,
} from 'lucide-react';

interface Product {
  id: string;
  brand: string;
  name: string;
  slug: string | null;
  category: string | null;
  description: string | null;
  target_exam: string | null;
  target_role: string | null;
  product_type: 'one_time' | 'subscription';
  price_display: string;
  price_cents: number | null;
  price_recurring_display: string | null;
  price_recurring_cents: number | null;
  checkout_url: string;
  checkout_url_subscription: string | null;
  sales_page_url: string | null;
  includes: string | null;
  duration: string | null;
  status: string;
  highlights: string | null;
  notes: string | null;
  extra_info_for_ia: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const PRODUCT_TYPES = [
  { value: 'one_time', label: 'Transação (compra única)' },
  { value: 'subscription', label: 'Assinatura' },
];

const BRANDS = [
  { value: 'monster', label: 'Monster Concursos' },
  { value: 'fagenius', label: 'FAGENIUS' },
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'Disponível', badge: '🟢' },
  { value: 'coming_soon', label: 'Em breve', badge: '🟡' },
  { value: 'sold_out', label: 'Esgotado', badge: '🔴' },
  { value: 'discontinued', label: 'Descontinuado', badge: '⚫' },
];

export default function CatalogPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [brandFilter, setBrandFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [jsonPreview, setJsonPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (brandFilter) params.set('brand', brandFilter);
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/ia/catalog?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar');
      setItems(data.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [brandFilter, statusFilter]);

  const loadJsonPreview = async () => {
    try {
      const res = await fetch('/api/ia/catalog?format=json');
      const data = await res.json().catch(() => ({}));
      setJsonPreview(data.catalog ?? 'Catálogo vazio.');
    } catch {
      setJsonPreview('Erro ao carregar.');
    }
  };

  const defaultProduct = (): Partial<Product> => ({
    brand: 'monster',
    name: '',
    slug: null,
    category: null,
    description: null,
    target_exam: null,
    target_role: null,
    product_type: 'one_time',
    price_display: '',
    price_cents: null,
    price_recurring_display: null,
    price_recurring_cents: null,
    checkout_url: '',
    checkout_url_subscription: null,
    sales_page_url: null,
    includes: null,
    duration: null,
    status: 'available',
    highlights: null,
    notes: null,
    extra_info_for_ia: null,
    sort_order: 0,
    is_active: true,
  });

  const [form, setForm] = useState<Partial<Product>>(defaultProduct());

  const openCreate = () => {
    setForm(defaultProduct());
    setEditingId(null);
    setShowForm(true);
    setFormError(null);
  };

  const openEdit = (p: Product) => {
    setForm({
      brand: p.brand,
      name: p.name,
      slug: p.slug,
      category: p.category,
      description: p.description,
      target_exam: p.target_exam,
      target_role: p.target_role,
      product_type: p.product_type ?? 'one_time',
      price_display: p.price_display,
      price_cents: p.price_cents,
      price_recurring_display: p.price_recurring_display ?? null,
      price_recurring_cents: p.price_recurring_cents ?? null,
      checkout_url: p.checkout_url,
      checkout_url_subscription: p.checkout_url_subscription ?? null,
      sales_page_url: p.sales_page_url,
      includes: p.includes,
      duration: p.duration,
      status: p.status,
      highlights: p.highlights,
      notes: p.notes,
      extra_info_for_ia: p.extra_info_for_ia ?? null,
      sort_order: p.sort_order,
      is_active: p.is_active,
    });
    setEditingId(p.id);
    setShowForm(true);
    setFormError(null);
  };

  const saveProduct = async () => {
    if (!form.name?.trim() || !form.price_display?.trim() || !form.checkout_url?.trim()) {
      setFormError('Preencha nome, preço à vista e link de checkout.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const res = await fetch(`/api/ia/catalog/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Falha ao atualizar');
      } else {
        const res = await fetch('/api/ia/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Falha ao criar');
      }
      setShowForm(false);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: string) => {
    if (!confirm('Desativar este produto? Ele deixará de aparecer no catálogo da IA.')) return;
    try {
      const res = await fetch(`/api/ia/catalog/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) throw new Error('Falha');
      load();
    } catch {
      alert('Falha ao desativar');
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm('Excluir permanentemente este produto?')) return;
    try {
      const res = await fetch(`/api/ia/catalog/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha');
      setShowForm(false);
      setEditingId(null);
      load();
    } catch {
      alert('Falha ao excluir');
    }
  };

  const statusBadge = (status: string) =>
    STATUS_OPTIONS.find((s) => s.value === status)?.badge ?? status;

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
            <Package className="w-7 h-7 text-[#7c3aed]" />
            Catálogo de produtos
          </h1>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
          >
            <option value="">Todas as marcas</option>
            {BRANDS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
          >
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.badge} {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadJsonPreview}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            <Eye className="w-4 h-4" />
            Ver JSON do catálogo
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9] text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Novo produto
          </button>
        </div>

        {jsonPreview !== null && (
          <div className="mb-6 p-4 rounded-xl bg-gray-900 text-gray-100 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
            {jsonPreview}
            <button
              type="button"
              onClick={() => setJsonPreview(null)}
              className="mt-2 text-gray-400 hover:text-white"
            >
              Fechar
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-gray-600 py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando...
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((p) => (
              <li
                key={p.id}
                className={`flex flex-wrap items-center justify-between gap-2 p-4 rounded-xl border ${
                  p.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-75'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{p.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                      {p.brand === 'monster' ? 'Monster' : 'FAGENIUS'}
                    </span>
                    {(p.product_type ?? 'one_time') === 'subscription' && (
                      <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700">
                        Assinatura
                      </span>
                    )}
                    <span title={p.status}>{statusBadge(p.status)}</span>
                    {!p.is_active && (
                      <span className="text-xs text-amber-600 font-medium">Inativo</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">
                    {p.price_display}
                    {p.price_recurring_display && (
                      <span className="text-gray-500"> · {p.price_recurring_display}</span>
                    )}
                  </p>
                  {p.checkout_url && (
                    <a
                      href={p.checkout_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#7c3aed] hover:underline truncate block max-w-full"
                    >
                      À vista: {p.checkout_url}
                    </a>
                  )}
                  {p.checkout_url_subscription?.trim() && (
                    <a
                      href={p.checkout_url_subscription.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#7c3aed] hover:underline truncate block max-w-full mt-0.5"
                    >
                      Mensal: {p.checkout_url_subscription.trim()}
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {p.is_active && (
                    <button
                      type="button"
                      onClick={() => deactivate(p.id)}
                      className="p-2 rounded-lg text-amber-600 hover:bg-amber-50"
                      title="Desativar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-center py-12 text-gray-500">
                Nenhum produto. Adicione um para a IA usar no atendimento.
              </li>
            )}
          </ul>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editingId ? 'Editar produto' : 'Novo produto'}
              </h2>
              {formError && (
                <p className="mb-3 text-sm text-red-600" role="alert">
                  {formError}
                </p>
              )}
              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Marca</label>
                  <select
                    value={form.brand ?? 'monster'}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                  >
                    {BRANDS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Nome do produto *</label>
                  <input
                    type="text"
                    value={form.name ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="Ex: Curso PM MG Soldado"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Tipo do produto</label>
                  <select
                    value={form.product_type ?? 'one_time'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        product_type: e.target.value === 'subscription' ? 'subscription' : 'one_time',
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                  >
                    {PRODUCT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-0.5">Transação = compra única. Assinatura = pode ter link à vista e link mensal.</p>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Preço à vista *</label>
                  <input
                    type="text"
                    value={form.price_display ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, price_display: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="R$ 497,00 ou 12x R$ 49,70. Pode ser dividido em parcelas."
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Descreva como quiser (à vista, parcelado, etc.).</p>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Preço à vista em centavos (opcional)</label>
                  <input
                    type="number"
                    value={form.price_cents ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        price_cents: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="Ex.: 49700 = R$ 497,00"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Não é obrigatório. A IA usa só o texto &quot;Preço à vista&quot; acima. Centavos serve para cálculos ou filtros futuros (ex.: produtos até X reais).</p>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Preço recorrência mensal (assinatura)</label>
                  <input
                    type="text"
                    value={form.price_recurring_display ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, price_recurring_display: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="R$ 49,70/mês"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Opcional. Preencha se o produto for assinatura com mensalidade.</p>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Recorrência em centavos (opcional)</label>
                  <input
                    type="number"
                    value={form.price_recurring_cents ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        price_recurring_cents: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="Ex.: 4970 = R$ 49,70/mês"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Opcional. A IA usa o texto &quot;Preço recorrência mensal&quot; acima.</p>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">
                    Link de checkout (à vista / principal) *
                  </label>
                  <input
                    type="url"
                    value={form.checkout_url ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, checkout_url: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="https://..."
                  />
                </div>
                {(form.product_type ?? 'one_time') === 'subscription' && (
                  <div>
                    <label className="block text-gray-700 font-medium mb-1">
                      Link de checkout (assinatura mensal)
                    </label>
                    <input
                      type="url"
                      value={form.checkout_url_subscription ?? ''}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          checkout_url_subscription: e.target.value?.trim() || null,
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                      placeholder="https://... (opcional)"
                    />
                    <p className="text-xs text-gray-500 mt-0.5">Opcional. Use se o pagamento mensal tiver outro link.</p>
                  </div>
                )}
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Link página vendas (opcional)</label>
                  <input
                    type="url"
                    value={form.sales_page_url ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, sales_page_url: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">O que inclui</label>
                  <input
                    type="text"
                    value={form.includes ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, includes: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="Videoaulas + PDF + Questões"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Duração</label>
                  <input
                    type="text"
                    value={form.duration ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="12 meses, Até a prova, Vitalício"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Status</label>
                  <select
                    value={form.status ?? 'available'}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.badge} {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Destaques</label>
                  <input
                    type="text"
                    value={form.highlights ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, highlights: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="4.8★ | 2000+ alunos"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Concurso alvo (Monster)</label>
                  <input
                    type="text"
                    value={form.target_exam ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, target_exam: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="PM MG, PRF, PC DF"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Cargo (Monster)</label>
                  <input
                    type="text"
                    value={form.target_role ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, target_role: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900"
                    placeholder="Soldado, Agente"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Informações adicionais para a IA</label>
                  <textarea
                    value={form.extra_info_for_ia ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, extra_info_for_ia: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-gray-900 min-h-[80px] resize-y"
                    placeholder="Regras, prazos, condições que a IA pode consultar ao responder sobre este produto. Ex.: Prazo de cancelamento 7 dias. Acesso liberado em até 24h após pagamento aprovado."
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Texto livre. A IA usará essas informações nas respostas ao aluno.</p>
                </div>
                {editingId && (
                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_active !== false}
                        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                        className="rounded border-gray-400 text-[#7c3aed]"
                      />
                      <span className="text-gray-700">Ativo (visível no catálogo da IA)</span>
                    </label>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-6">
                <button
                  type="button"
                  onClick={saveProduct}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50 font-medium"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancelar
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => deleteProduct(editingId)}
                    className="px-4 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 font-medium ml-auto"
                  >
                    <Trash2 className="w-4 h-4 inline mr-1" />
                    Excluir
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
