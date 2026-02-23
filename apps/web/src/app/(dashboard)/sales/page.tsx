'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Loader2, MessageSquare, ShoppingBag } from 'lucide-react';

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
  created_at: string;
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

  useEffect(() => {
    let cancelled = false;
    async function fetchSales() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (statusFilter) params.set('status', statusFilter);
        const res = await fetch(`/api/integrations/digital-guru/sales?${params.toString()}`);
        if (!res.ok) throw new Error('Falha ao carregar vendas');
        const data = await res.json();
        if (!cancelled) setSales(data.sales ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSales();
    return () => { cancelled = true; };
  }, [statusFilter]);

  return (
    <div className="flex flex-col h-full overflow-auto bg-[#0d0d1a]" style={{ color: '#e2e8f0' }}>
      <div className="p-6 max-w-4xl w-full">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingBag className="w-6 h-6 text-[#a78bfa]" />
          <h1 className="text-2xl font-bold text-white">Últimas vendas (Guru)</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Vendas processadas pelo Digital Guru. Abra a conversa do aluno sem sair do sistema.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-sm text-gray-500">Filtrar por status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-center text-red-400 py-12">{error}</p>
        ) : sales.length === 0 ? (
          <p className="text-center text-gray-500 py-12">
            Nenhuma venda registrada ainda. As vendas aparecem aqui quando o webhook da Guru notifica o MonsterChat.
          </p>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-gray-500 text-xs uppercase tracking-wider">
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Contato</th>
                    <th className="py-3 px-4">Produto(s)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 w-28">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                        {formatDate(s.sold_at)}
                      </td>
                      <td className="py-3 px-4 font-medium text-white">
                        {s.contact_name || '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-400">
                        <span className="block truncate max-w-[160px]" title={s.contact_email || s.contact_phone || ''}>
                          {s.contact_email || s.contact_phone || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300 max-w-[200px]">
                        <span className="line-clamp-2" title={s.product_names}>
                          {s.product_names}
                        </span>
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
                        {s.conversation_id ? (
                          <Link
                            href={`/inbox/${s.conversation_id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#8b5cf6]/20 text-[#a78bfa] hover:bg-[#8b5cf6]/30 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Abrir conversa
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-500" title="Contato ainda não conversou no chat">
                            Sem conversa
                          </span>
                        )}
                      </td>
                    </tr>
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
