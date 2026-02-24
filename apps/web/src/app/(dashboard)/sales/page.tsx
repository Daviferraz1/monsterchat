'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { Loader2, MessageSquare, ShoppingBag, Download, ChevronDown, ChevronUp, Search, ChevronRight, CreditCard, MapPin, Phone, ExternalLink, X, Receipt, Wallet } from 'lucide-react';

interface WhatsAppTemplateItem {
  name: string;
  language: string;
  category?: string;
  body_preview?: string;
  body_text?: string;
}

interface GuruSaleItem {
  id: string;
  transaction_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  product_names: string;
  status: string | null;
  sold_at: string;
  contact_id: string | null;
  conversation_id: string | null;
  payment_method: string | null;
  payment_total: number | null;
  address_full: string | null;
  created_at: string;
}

function formatPhoneForWhatsApp(phone: string | null | undefined, templateMessage?: string): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  const base = `https://wa.me/${withCountry}`;
  if (templateMessage?.trim()) {
    return `${base}?text=${encodeURIComponent(templateMessage.trim())}`;
  }
  return base;
}

const WHATSAPP_TEMPLATE = 'Olá! Vi seu contato em nossa base. Como posso ajudar?';

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '—';
  const d = phone.replace(/\D/g, '');
  // Brasil: 55 (país) + 2 (DDD) + 9 (celular)
  if (d.length >= 12 && d.startsWith('55')) {
    const pais = d.slice(0, 2);   // 55
    const ddd = d.slice(2, 4);    // 37
    const num = d.slice(4);       // 991143368 → 99114-3368
    const part = num.length >= 5 ? `${num.slice(0, 5)}-${num.slice(5)}` : num;
    return `+${pais} (${ddd}) ${part}`;
  }
  if (d.length >= 11) {
    // Sem país: assume DDD 2 dígitos + 9 dígitos
    const ddd = d.slice(0, 2);
    const num = d.slice(2);
    const part = num.length >= 5 ? `${num.slice(0, 5)}-${num.slice(5)}` : num;
    return `(${ddd}) ${part}`;
  }
  return phone;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function paymentMethodIcon(method: string | null | undefined): { icon: typeof CreditCard; label: string; colorClass: string } {
  const m = (method ?? '').toLowerCase();
  if (/pix/i.test(m)) return { icon: Wallet, label: 'Pix', colorClass: 'text-green-400' };
  if (/boleto|bank.?slip|bank_slip/i.test(m)) return { icon: Receipt, label: 'Boleto', colorClass: 'text-amber-400' };
  if (/cart[oã]|card|credit|d[eé]bito|credito|debito/i.test(m)) return { icon: CreditCard, label: 'Cartão', colorClass: 'text-violet-400' };
  if (method?.trim()) return { icon: CreditCard, label: method.trim(), colorClass: 'text-gray-400' };
  return { icon: CreditCard, label: '—', colorClass: 'text-gray-500' };
}

function statusLabel(status: string | null): string {
  if (!status) return '—';
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    approved: 'Aprovado',
    paid: 'Pago',
    pending: 'Pendente',
    refused: 'Recusado',
    cancelled: 'Cancelado',
    canceled: 'Cancelado',
    refunded: 'Reembolsado',
    expired: 'Expirado',
    processing: 'Processando',
    analyzing: 'Em análise',
  };
  return map[s] ?? status;
}

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'paid', label: 'Pago' },
  { value: 'pending', label: 'Pendente' },
  { value: 'refused_or_cancelled', label: 'Recusado / Cancelado' },
  { value: 'refunded', label: 'Reembolsado' },
  { value: 'expired', label: 'Expirado' },
  { value: 'processing', label: 'Processando' },
  { value: 'analyzing', label: 'Em análise' },
];

export default function SalesPage() {
  const [sales, setSales] = useState<GuruSaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: boolean; message: string; errors?: string[] } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [fetchEmail, setFetchEmail] = useState('');
  const [fetchPhone, setFetchPhone] = useState('');
  const [fetchGuruLoading, setFetchGuruLoading] = useState(false);
  const [fetchGuruResult, setFetchGuruResult] = useState<{
    transactions?: unknown[];
    message?: string;
    error?: string;
    configured?: boolean;
  } | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [templateModal, setTemplateModal] = useState<{
    open: boolean;
    phone: string | null;
    contactName: string | null;
    conversationId: string | null;
  }>({ open: false, phone: null, contactName: null, conversationId: null });
  const [templates, setTemplates] = useState<WhatsAppTemplateItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplateItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        params.set('limit', statusFilter ? '50' : '500');
        if (statusFilter) params.set('status', statusFilter);
        if (debouncedSearch) params.set('search', debouncedSearch);
        const res = await fetch(`/api/integrations/digital-guru/sales?${params.toString()}`);
        if (!res.ok) throw new Error('Falha ao carregar vendas');
        const data = await res.json();
        if (!cancelled) setSales(data.sales ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [statusFilter, refreshKey, debouncedSearch]);

  useEffect(() => {
    if (!templateModal.open || !templateModal.phone) {
      setTemplates([]);
      setSelectedTemplate(null);
      return;
    }
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplates([]);
    setSelectedTemplate(null);
    fetch('/api/integrations/whatsapp/templates')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.templates)) setTemplates(data.templates);
      })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setTemplatesLoading(false); });
    return () => { cancelled = true; };
  }, [templateModal.open, templateModal.phone]);

  const openTemplateModal = (s: GuruSaleItem) => {
    if (s.conversation_id) return;
    setTemplateModal({
      open: true,
      phone: s.contact_phone,
      contactName: s.contact_name,
      conversationId: s.conversation_id,
    });
  };

  const messageToSend = selectedTemplate?.body_text
    ? selectedTemplate.body_text.replace(/\{\{\d+\}\}/g, '').trim()
    : WHATSAPP_TEMPLATE;
  const whatsAppUrl = templateModal.phone ? formatPhoneForWhatsApp(templateModal.phone, messageToSend) : null;

  const handleImport = async () => {
    setImportResult(null);
    let arr: unknown[];
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error('O JSON deve ser um array de transações.');
      arr = parsed;
    } catch (e) {
      setImportResult({
        ok: false,
        message: e instanceof SyntaxError ? 'JSON inválido.' : (e instanceof Error ? e.message : 'Erro ao interpretar JSON.'),
      });
      return;
    }
    setImportLoading(true);
    try {
      const res = await fetch('/api/integrations/digital-guru/import-retroactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: arr }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportResult({ ok: false, message: data.error || 'Erro na importação', errors: data.detail ? [data.detail] : undefined });
        return;
      }
      setImportResult({
        ok: true,
        message: data.message ?? 'Importação concluída.',
        errors: data.errors,
      });
      setImportJson('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setImportResult({ ok: false, message: e instanceof Error ? e.message : 'Erro ao importar.' });
    } finally {
      setImportLoading(false);
    }
  };

  const handleFetchFromGuru = async () => {
    const email = fetchEmail.trim();
    const phone = fetchPhone.trim().replace(/\D/g, '');
    if (!email && !phone) {
      setFetchGuruResult({ error: 'Informe e-mail ou telefone.' });
      return;
    }
    setFetchGuruResult(null);
    setFetchGuruLoading(true);
    try {
      const params = new URLSearchParams();
      if (email) params.set('email', email);
      if (phone) params.set('phone', phone);
      const res = await fetch(`/api/integrations/digital-guru/fetch-from-guru?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 501) {
        setFetchGuruResult({ error: data.message || data.error, configured: false });
        return;
      }
      if (!res.ok) {
        setFetchGuruResult({ error: data.error || data.detail || `Erro ${res.status} ao buscar na Guru.` });
        return;
      }
      if (data.ok === false) {
        const msg = [data.error, data.detail, data.hint].filter(Boolean).join(' — ');
        setFetchGuruResult({ error: msg || 'A API da Guru respondeu com erro.' });
        return;
      }
      setFetchGuruResult({
        transactions: data.transactions ?? [],
        message: data.message,
        configured: true,
      });
    } catch (e) {
      setFetchGuruResult({ error: e instanceof Error ? e.message : 'Erro ao buscar.' });
    } finally {
      setFetchGuruLoading(false);
    }
  };

  const handleImportFetched = async () => {
    if (!fetchGuruResult?.transactions?.length) return;
    setImportResult(null);
    setImportLoading(true);
    try {
      const res = await fetch('/api/integrations/digital-guru/import-retroactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: fetchGuruResult.transactions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportResult({ ok: false, message: data.error || 'Erro na importação' });
        return;
      }
      setImportResult({ ok: true, message: data.message ?? 'Importação concluída.', errors: data.errors });
      setFetchGuruResult(null);
      setFetchEmail('');
      setFetchPhone('');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setImportResult({ ok: false, message: e instanceof Error ? e.message : 'Erro ao importar.' });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full min-h-0 overflow-auto bg-[#0d0d1a]" style={{ color: '#e2e8f0' }}>
      <div className="flex flex-col flex-1 min-w-0 w-full p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1 shrink-0">
          <ShoppingBag className="w-6 h-6 text-[#a78bfa]" />
          <h1 className="text-2xl font-bold text-white">Últimas vendas (Guru)</h1>
        </div>
        <p className="text-sm text-gray-500 mb-4 shrink-0">
          Vendas processadas pelo Digital Guru. Abra a conversa do aluno sem sair do sistema.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-4 shrink-0">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar por e-mail, telefone ou nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50"
            />
          </div>
          <label className="text-sm text-gray-500 shrink-0">Status:</label>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-3 pr-8 py-2 rounded-lg text-sm min-w-[180px] w-full bg-[#1a1a2e] border border-white/20 text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 focus:border-[#8b5cf6]/50 appearance-none cursor-pointer"
              style={{ colorScheme: 'dark' }}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value} className="bg-[#1a1a2e] text-gray-100">
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-300 hover:bg-white/5 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Importar vendas antigas (retroativas)
            </span>
            {showImport ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showImport && (
            <div className="px-4 pb-4 pt-0 border-t border-white/5 space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-2">Buscar vendas na Guru (que ainda não foram recebidas)</p>
                <p className="text-xs text-gray-500 mb-2">
                  Informe e-mail ou telefone para buscar vendas diretamente na API da Guru. Requer configuração no servidor (DIGITAL_GURU_USER_TOKEN e DIGITAL_GURU_API_BASE_URL).
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="E-mail"
                    value={fetchEmail}
                    onChange={(e) => setFetchEmail(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 w-48"
                  />
                  <input
                    type="text"
                    placeholder="Telefone"
                    value={fetchPhone}
                    onChange={(e) => setFetchPhone(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 w-40"
                  />
                  <button
                    type="button"
                    onClick={handleFetchFromGuru}
                    disabled={fetchGuruLoading}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-white/10 text-gray-300 hover:bg-white/15 disabled:opacity-50 flex items-center gap-2"
                  >
                    {fetchGuruLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Buscar na Guru
                  </button>
                </div>
                {fetchGuruResult && (
                  <div className="text-sm">
                    {fetchGuruResult.error && (
                      <p className="text-amber-400 mb-1">{fetchGuruResult.error}</p>
                    )}
                    {fetchGuruResult.message && !fetchGuruResult.error && (
                      <p className="text-gray-400 mb-1">{fetchGuruResult.message}</p>
                    )}
                    {fetchGuruResult.transactions && fetchGuruResult.transactions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleImportFetched}
                        disabled={importLoading}
                        className="mt-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#8b5cf6] text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {importLoading ? 'Importando...' : `Importar estas ${fetchGuruResult.transactions.length} venda(s)`}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="border-t border-white/10 pt-3">
              <p className="text-xs font-medium text-gray-400 mb-2">Ou cole o JSON das transações</p>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='[{ "id": "...", "contact": { "email": "...", "phone_number": "...", "name": "..." }, "product": { "name": "..." }, "status": "approved", "dates": { "ordered_at": "..." } }, ...]'
                rows={6}
                className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 font-mono resize-y mb-3"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importLoading || !importJson.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[#8b5cf6] text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {importLoading ? 'Importando...' : 'Importar'}
                </button>
                {importResult && (
                  <span className={importResult.ok ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
                    {importResult.message}
                    {importResult.errors?.length ? ` (${importResult.errors.length} aviso(s))` : ''}
                  </span>
                )}
              </div>
              {importResult?.errors && importResult.errors.length > 0 && (
                <ul className="mt-2 text-xs text-amber-400 list-disc list-inside max-h-24 overflow-y-auto">
                  {importResult.errors.slice(0, 10).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {importResult.errors.length > 10 && (
                    <li>… e mais {importResult.errors.length - 10} aviso(s)</li>
                  )}
                </ul>
              )}
            </div>
          </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-center text-red-400 py-12">{error}</p>
        ) : sales.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            {debouncedSearch || statusFilter
              ? 'Nenhuma venda encontrada para o filtro ou busca informados.'
              : 'Nenhuma venda registrada ainda. As vendas aparecem aqui quando o webhook da Guru notifica o MonsterChat.'}
          </p>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-gray-500 text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Contato</th>
                    <th className="py-3 px-4">Telefone</th>
                    <th className="py-3 px-4">Produto(s)</th>
                    <th className="py-3 px-4">Pagamento</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 min-w-[200px]">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <Fragment key={s.id}>
                      <tr className="border-b border-white/5 hover:bg-white/[0.03]">
                        <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                          {formatDate(s.sold_at)}
                        </td>
                        <td className="py-3 px-4 font-medium text-white">
                          {s.contact_name || '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-400">
                          <span className="block truncate max-w-[160px]" title={s.contact_email || s.contact_phone || ''}>
                            {s.contact_email || (s.contact_phone ? formatPhoneDisplay(s.contact_phone) : '—')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 whitespace-nowrap">
                          {s.contact_phone ? (
                            s.conversation_id ? (
                              <Link
                                href={`/inbox/${s.conversation_id}`}
                                className="flex items-center gap-1.5 text-[#a78bfa] hover:text-[#c4b5fd] hover:underline"
                                title="Abrir conversa no sistema"
                              >
                                <Phone className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                {formatPhoneDisplay(s.contact_phone)}
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openTemplateModal(s)}
                                className="flex items-center gap-1.5 text-green-400 hover:text-green-300 hover:underline text-left"
                                title="Iniciar conversa — escolher template"
                              >
                                <Phone className="w-3.5 h-3.5 shrink-0" />
                                {formatPhoneDisplay(s.contact_phone)}
                              </button>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-300 max-w-[200px]">
                          <span className="line-clamp-2" title={s.product_names}>
                            {s.product_names}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 whitespace-nowrap">
                          {(() => {
                            const { icon: Icon, label, colorClass } = paymentMethodIcon(s.payment_method);
                            const value = s.payment_total != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(s.payment_total)) : null;
                            return (
                              <span className="flex items-center gap-2">
                                <span className={`flex items-center gap-1.5 ${colorClass}`} title={label}>
                                  <Icon className="w-4 h-4 shrink-0" />
                                  <span>{label}</span>
                                </span>
                                {value && <span className="text-[#a78bfa] font-medium">{value}</span>}
                                {!value && !s.payment_method && '—'}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={
                              (s.status?.toLowerCase() === 'approved' || s.status?.toLowerCase() === 'paid')
                                ? 'text-green-400'
                                : s.status?.toLowerCase() === 'pending'
                                  ? 'text-amber-400'
                                  : ['refused', 'cancelled', 'canceled', 'refunded', 'expired'].includes(s.status?.toLowerCase() ?? '')
                                    ? 'text-red-400'
                                    : ['processing', 'analyzing'].includes(s.status?.toLowerCase() ?? '')
                                      ? 'text-blue-400'
                                      : 'text-gray-500'
                            }
                          >
                            {statusLabel(s.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setExpandedSaleId((id) => (id === s.id ? null : s.id))}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-[#a78bfa] hover:bg-white/5 transition-colors"
                              title="Ver mais detalhes"
                            >
                              {expandedSaleId === s.id ? (
                                <>Menos <ChevronUp className="w-3.5 h-3.5" /></>
                              ) : (
                                <>Ver mais <ChevronRight className="w-3.5 h-3.5" /></>
                              )}
                            </button>
                            {s.conversation_id ? (
                              <Link
                                href={`/inbox/${s.conversation_id}`}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#8b5cf6]/20 text-[#a78bfa] hover:bg-[#8b5cf6]/30 transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Abrir conversa
                              </Link>
                            ) : formatPhoneForWhatsApp(s.contact_phone) ? (
                              <button
                                type="button"
                                onClick={() => openTemplateModal(s)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                                title="Escolher template e iniciar conversa"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Iniciar conversa
                              </button>
                            ) : (
                              <span className="text-xs text-gray-500" title="Sem telefone para WhatsApp">
                                Sem conversa
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedSaleId === s.id && (
                        <tr key={`${s.id}-details`} className="border-b border-white/5 bg-white/[0.02]">
                          <td colSpan={8} className="py-4 px-4">
                            <div className="flex flex-wrap gap-6 text-sm">
                              {(s.payment_method || s.payment_total != null) && (
                                <div className="flex items-start gap-2">
                                  <CreditCard className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                                  <div>
                                    <span className="text-gray-500 block mb-0.5">Meio de pagamento / Valor</span>
                                    <span className="text-gray-300">
                                      {s.payment_method || '—'}
                                      {s.payment_total != null && (
                                        <span className="ml-2 text-[#a78bfa]">
                                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(s.payment_total))}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {s.address_full && (
                                <div className="flex items-start gap-2 min-w-0 max-w-md">
                                  <MapPin className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-gray-500 block mb-0.5">Endereço</span>
                                    <span className="text-gray-300 break-words">{s.address_full}</span>
                                  </div>
                                </div>
                              )}
                              {!s.payment_method && s.payment_total == null && !s.address_full && (
                                <span className="text-gray-500">Nenhum detalhe de pagamento ou endereço registrado para esta venda.</span>
                              )}
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

      {/* Modal Nova conversa — escolher template WhatsApp */}
      {templateModal.open && templateModal.phone && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setTemplateModal((m) => ({ ...m, open: false }))}
          role="dialog"
          aria-modal="true"
          aria-label="Nova conversa"
        >
          <div
            className="bg-[#1a1a2e] border border-white/20 rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">Nova conversa</h2>
              <button
                type="button"
                onClick={() => setTemplateModal((m) => ({ ...m, open: false }))}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-white/10">
              <p className="text-sm text-gray-400">
                {templateModal.contactName && <span className="text-white font-medium">{templateModal.contactName}</span>}
                {templateModal.contactName && ' · '}
                <span className="text-gray-300">{formatPhoneDisplay(templateModal.phone)}</span>
              </p>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-3">Selecione um template para enviar pelo WhatsApp:</p>
              {templatesLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">
                  Nenhum template aprovado encontrado. Será usada uma mensagem padrão.
                </p>
              ) : (
                <ul className="space-y-2">
                  {templates.map((t) => (
                    <li key={`${t.name}-${t.language}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedTemplate(t)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          selectedTemplate?.name === t.name && selectedTemplate?.language === t.language
                            ? 'border-[#8b5cf6] bg-[#8b5cf6]/20 text-white'
                            : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        <span className="font-medium block">{t.name}</span>
                        {t.body_preview && (
                          <span className="text-xs text-gray-500 line-clamp-2 mt-0.5 block">{t.body_preview}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="p-4 border-t border-white/10 flex flex-col gap-2">
              {whatsAppUrl && (
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir no WhatsApp com este template
                </a>
              )}
              <button
                type="button"
                onClick={() => setTemplateModal((m) => ({ ...m, open: false }))}
                className="w-full py-2 rounded-lg text-sm text-gray-400 hover:bg-white/5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
