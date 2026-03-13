'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import {
  Loader2,
  MessageSquare,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  User,
  Package,
  Calendar,
  MapPin,
  Phone,
  Mail,
  FileText,
  ExternalLink,
} from 'lucide-react';

interface SubscriptionItem {
  id: string;
  subscription_id: string;
  internal_id: string | null;
  subscription_code: string | null;
  contact_id: string | null;
  subscriber_email: string | null;
  subscriber_name: string | null;
  subscriber_doc: string | null;
  subscriber_phone: string | null;
  subscriber_phone_local_code: string | null;
  subscriber_address: string | null;
  subscriber_address_number: string | null;
  subscriber_address_comp: string | null;
  subscriber_address_district: string | null;
  subscriber_address_city: string | null;
  subscriber_address_state: string | null;
  subscriber_address_zip_code: string | null;
  subscriber_address_country: string | null;
  last_status: string | null;
  current_invoice_id: string | null;
  current_invoice_cycle: number | null;
  current_invoice_status: string | null;
  current_invoice_charge_at: string | null;
  current_invoice_value: number | null;
  current_invoice_period_start: string | null;
  current_invoice_period_end: string | null;
  current_invoice_payment_url: string | null;
  product_id: string | null;
  product_name: string | null;
  offer_id: string | null;
  offer_name: string | null;
  next_cycle_at: string | null;
  cycle_end_date: string | null;
  cycle_start_date: string | null;
  started_at: string | null;
  last_status_at: string | null;
  canceled_at: string | null;
  cancel_at_cycle_end: boolean | null;
  cancel_reason: string | null;
  cancelled_by_name: string | null;
  cancelled_by_email: string | null;
  cancelled_by_date: string | null;
  payment_method: string | null;
  charged_every_days: number | null;
  charged_times: number | null;
  next_cycle_value: number | null;
  is_overdue: boolean | null;
  days_overdue: number | null;
  overdue_since: string | null;
  created_at: string;
  updated_at: string;
  conversation_id: string | null;
}

interface Stats {
  total: number;
  overdue_count: number;
  active_count: number;
  cycles_paid_count: number;
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '—';
  const d = phone.replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) {
    const pais = d.slice(0, 2);
    const ddd = d.slice(2, 4);
    const num = d.slice(4);
    const part = num.length >= 5 ? `${num.slice(0, 5)}-${num.slice(5)}` : num;
    return `+${pais} (${ddd}) ${part}`;
  }
  if (d.length >= 11) {
    const ddd = d.slice(0, 2);
    const num = d.slice(2);
    const part = num.length >= 5 ? `${num.slice(0, 5)}-${num.slice(5)}` : num;
    return `(${ddd}) ${part}`;
  }
  return phone;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function subscriptionStatusLabel(status: string | null): string {
  if (!status) return '—';
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    active: 'Ativa',
    canceled: 'Cancelada',
    cancelled: 'Cancelada',
    past_due: 'Pagamento atrasado',
    unpaid: 'Não paga',
    trialing: 'Período de teste',
    paused: 'Pausada',
  };
  return map[s] ?? status;
}

function invoiceStatusLabel(status: string | null): string {
  if (!status) return '—';
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    paid: 'Paga',
    approved: 'Aprovada',
    open: 'Aberta',
    pending: 'Pendente',
    past_due: 'Vencida',
    unpaid: 'Não paga',
    refused: 'Recusada',
    cancelled: 'Cancelada',
  };
  return map[s] ?? status;
}

function buildAddressFull(s: SubscriptionItem): string {
  const parts = [
    s.subscriber_address,
    s.subscriber_address_number,
    s.subscriber_address_comp,
    s.subscriber_address_district,
    s.subscriber_address_city,
    s.subscriber_address_state,
    s.subscriber_address_zip_code,
    s.subscriber_address_country,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : '';
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, overdue_count: 0, active_count: 0, cycles_paid_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedSubscriptionId, setCopiedSubscriptionId] = useState<string | null>(null);

  const copyPaymentLink = (url: string, subscriptionId: string) => {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiedSubscriptionId(subscriptionId);
        setTimeout(() => setCopiedSubscriptionId(null), 2000);
      },
      () => setCopiedSubscriptionId(null)
    );
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const load = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', '200');
    if (overdueOnly) params.set('overdue', 'true');
    if (statusFilter) params.set('status', statusFilter);
    if (debouncedSearch) params.set('search', debouncedSearch);
    fetch(`/api/integrations/digital-guru/subscriptions?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar assinaturas');
        return res.json();
      })
      .then((data) => {
        setSubscriptions(data.subscriptions ?? []);
        setStats(data.stats ?? { total: 0, overdue_count: 0, active_count: 0, cycles_paid_count: 0 });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [overdueOnly, statusFilter, debouncedSearch]);

  return (
    <div
      className="flex flex-col flex-1 min-w-0 h-full min-h-0 overflow-auto bg-[#0d0d1a]"
      style={{ color: '#e2e8f0' }}
    >
      <div className="flex flex-col flex-1 min-w-0 w-full p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1 shrink-0">
          <CreditCard className="w-6 h-6 text-[#a78bfa]" />
          <h1 className="text-2xl font-bold text-white">Assinaturas (Guru)</h1>
        </div>
        <p className="text-sm text-gray-500 mb-4 shrink-0">
          Dashboard de assinaturas e pagamentos em atraso. Dados completos do cliente para cobrança.
        </p>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 shrink-0">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Total de assinaturas</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-xs font-medium text-amber-400/90 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Ciclos em atraso
            </p>
            <p className="text-2xl font-bold text-amber-400">{stats.overdue_count}</p>
            <p className="text-xs text-gray-500 mt-1">Assinaturas com fatura atual vencida (para cobrança)</p>
          </div>
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4">
            <p className="text-xs font-medium text-green-400/90 uppercase tracking-wider mb-1">Ciclo atual pago</p>
            <p className="text-2xl font-bold text-green-400">{stats.cycles_paid_count}</p>
            <p className="text-xs text-gray-500 mt-1">Fatura do ciclo atual já paga</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Status ativo</p>
            <p className="text-2xl font-bold text-white">{stats.active_count}</p>
            <p className="text-xs text-gray-500 mt-1">Assinaturas ativas (last_status = active)</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4 shrink-0">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail, telefone, CPF ou produto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-400 hover:text-white">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="rounded border-white/20 bg-white/5 text-amber-500 focus:ring-[#8b5cf6]/50"
            />
            Só atrasadas
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg text-sm min-w-[140px] bg-[#1a1a2e] border border-white/20 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 appearance-none cursor-pointer"
            style={{ colorScheme: 'dark' }}
          >
            <option value="">Todos os status</option>
            <option value="active">Ativa</option>
            <option value="canceled">Cancelada</option>
            <option value="past_due">Pagamento atrasado</option>
            <option value="unpaid">Não paga</option>
            <option value="trialing">Teste</option>
          </select>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-center text-red-400 py-12">{error}</p>
        ) : subscriptions.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            {debouncedSearch || statusFilter || overdueOnly
              ? 'Nenhuma assinatura encontrada para os filtros informados.'
              : 'Nenhuma assinatura registrada ainda. Configure o webhook de assinaturas na Guru (mesma URL do webhook de transações).'}
          </p>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-gray-500 text-xs uppercase tracking-wider">
                    <th className="py-3 px-4 w-8" />
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Contato</th>
                    <th className="py-3 px-4">Produto</th>
                    <th className="py-3 px-4">Ciclo</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Fatura</th>
                    <th className="py-3 px-4">Vencimento</th>
                    <th className="py-3 px-4">Dias atraso</th>
                    <th className="py-3 px-4 min-w-[180px]">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <Fragment key={s.id}>
                      <tr className={`border-b border-white/5 hover:bg-white/[0.03] ${s.is_overdue ? 'bg-amber-500/5' : ''}`}>
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => setExpandedId((id) => (id === s.id ? null : s.id))}
                            className="p-1 rounded text-gray-400 hover:text-[#a78bfa]"
                            aria-label={expandedId === s.id ? 'Recolher' : 'Expandir'}
                          >
                            {expandedId === s.id ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-white block">{s.subscriber_name || '—'}</span>
                          {s.subscriber_doc && (
                            <span className="text-xs text-gray-500">CPF/CNPJ: {s.subscriber_doc}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="block text-gray-400 truncate max-w-[180px]" title={s.subscriber_email ?? ''}>
                            {s.subscriber_email || '—'}
                          </span>
                          <span className="block text-gray-500 text-xs mt-0.5">
                            {s.subscriber_phone ? formatPhoneDisplay(s.subscriber_phone) : '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 max-w-[200px]">
                          <span className="line-clamp-2" title={s.product_name ?? ''}>
                            {s.product_name || '—'}
                          </span>
                          {s.offer_name && (
                            <span className="text-xs text-gray-500 block mt-0.5">{s.offer_name}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-300">
                            {s.current_invoice_cycle != null ? `Ciclo ${s.current_invoice_cycle}` : '—'}
                          </span>
                          {s.charged_times != null && (
                            <span className="text-xs text-gray-500 block mt-0.5">{s.charged_times} cobrança(s) realizada(s)</span>
                          )}
                          {s.is_overdue && (
                            <span className="text-amber-400 text-xs font-medium block mt-0.5">1 em atraso</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={
                              s.last_status === 'active'
                                ? 'text-green-400'
                                : s.is_overdue || s.last_status === 'past_due' || s.last_status === 'unpaid'
                                  ? 'text-amber-400'
                                  : ['canceled', 'cancelled'].includes(s.last_status ?? '')
                                    ? 'text-red-400'
                                    : 'text-gray-500'
                            }
                          >
                            {subscriptionStatusLabel(s.last_status)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={s.current_invoice_status === 'paid' ? 'text-green-400' : 'text-gray-400'}>
                            {invoiceStatusLabel(s.current_invoice_status)}
                          </span>
                          {s.current_invoice_value != null && (
                            <span className="block text-[#a78bfa] text-xs mt-0.5">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(s.current_invoice_value))}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                          {formatDate(s.current_invoice_charge_at)}
                        </td>
                        <td className="py-3 px-4">
                          {s.is_overdue && s.days_overdue != null ? (
                            <span className="font-medium text-amber-400">{s.days_overdue} dia(s)</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setExpandedId((id) => (id === s.id ? null : s.id))}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-[#a78bfa]"
                            >
                              {expandedId === s.id ? 'Menos' : 'Detalhes'}
                            </button>
                            {s.current_invoice_payment_url && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => copyPaymentLink(s.current_invoice_payment_url!, s.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-amber-400 hover:bg-amber-500/10"
                                  title="Copiar link da fatura para enviar ao cliente (WhatsApp, e-mail, etc.)"
                                >
                                  {copiedSubscriptionId === s.id ? 'Copiado!' : 'Copiar link'}
                                </button>
                                <a
                                  href={s.current_invoice_payment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-green-400 hover:underline"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Abrir pagamento
                                </a>
                              </>
                            )}
                            {s.conversation_id && (
                              <Link
                                href={`/inbox/${s.conversation_id}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#8b5cf6]/20 text-[#a78bfa] hover:bg-[#8b5cf6]/30"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Conversa
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          <td colSpan={10} className="py-4 px-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                                  <User className="w-4 h-4" /> Dados do cliente (cobrança)
                                </h4>
                                <div className="flex flex-wrap gap-4">
                                  <div>
                                    <span className="text-gray-500 block text-xs">Nome</span>
                                    <span className="text-gray-300">{s.subscriber_name || '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 block text-xs">E-mail</span>
                                    <span className="text-gray-300">{s.subscriber_email || '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 block text-xs">Telefone</span>
                                    <span className="text-gray-300">{s.subscriber_phone ? formatPhoneDisplay(s.subscriber_phone) : '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 block text-xs">CPF/CNPJ</span>
                                    <span className="text-gray-300">{s.subscriber_doc || '—'}</span>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-gray-500 block text-xs mb-1">Endereço completo</span>
                                  <span className="text-gray-300">{buildAddressFull(s) || '—'}</span>
                                </div>
                              </div>
                              <div className="space-y-3">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                                  <Package className="w-4 h-4" /> Assinatura
                                </h4>
                                <div className="flex flex-wrap gap-4">
                                  <div>
                                    <span className="text-gray-500 block text-xs">Produto</span>
                                    <span className="text-gray-300">{s.product_name || '—'}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 block text-xs">Ciclo atual</span>
                                    <span className="text-gray-300">
                                      {s.current_invoice_cycle != null ? `Ciclo ${s.current_invoice_cycle}` : '—'}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 block text-xs">Cobrança</span>
                                    <span className="text-gray-300">
                                      {s.charged_every_days ? `A cada ${s.charged_every_days} dia(s)` : '—'}
                                      {s.charged_times != null && ` · ${s.charged_times} cobrança(s) realizada(s)`}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 block text-xs">Próximo ciclo</span>
                                    <span className="text-gray-300">{formatDate(s.next_cycle_at)}</span>
                                  </div>
                                  {s.current_invoice_payment_url && (
                                    <div className="w-full">
                                      <span className="text-gray-500 block text-xs mb-1">Link da fatura (enviar ao cliente)</span>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <code className="text-xs text-gray-400 truncate max-w-md block bg-white/5 px-2 py-1 rounded">
                                          {s.current_invoice_payment_url}
                                        </code>
                                        <button
                                          type="button"
                                          onClick={() => copyPaymentLink(s.current_invoice_payment_url!, s.id)}
                                          className="text-xs text-amber-400 hover:underline"
                                        >
                                          {copiedSubscriptionId === s.id ? 'Copiado!' : 'Copiar'}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-gray-500 block text-xs">Meio de pagamento</span>
                                    <span className="text-gray-300">{s.payment_method || '—'}</span>
                                  </div>
                                </div>
                                {s.cancel_at_cycle_end && (
                                  <p className="text-amber-400 text-xs mt-2">
                                    Cancelamento ao fim do ciclo. Motivo: {s.cancel_reason || '—'}
                                  </p>
                                )}
                                {s.overdue_since && (
                                  <p className="text-amber-400 text-xs mt-2">
                                    Atraso desde: {formatDate(s.overdue_since)} ({s.days_overdue ?? 0} dia(s))
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
