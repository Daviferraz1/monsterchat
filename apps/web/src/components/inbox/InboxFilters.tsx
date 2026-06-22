'use client';

import { MessageCircle, Instagram, Search } from 'lucide-react';
import type { ChannelTypeFilter, RepliedFilter } from '@/hooks/useConversations';

interface InboxFiltersProps {
  filters: {
    status?: string;
    assigned_to?: string;
    channel_id?: string;
    channel_type?: ChannelTypeFilter;
    replied?: RepliedFilter;
    search?: string;
  };
  onFiltersChange: (filters: InboxFiltersProps['filters']) => void;
  /** Quantidade de conversas não respondidas (badge vermelho no chip). */
  notRepliedCount?: number;
}

/** Linha de pills rolável na horizontal (sem quebrar em várias linhas) — estilo WhatsApp. */
const ROW = 'flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const CHIP = 'shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all';

function chipStyle(selected: boolean) {
  return {
    background: selected ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
    color: selected ? '#a78bfa' : '#94a3b8',
  };
}

export function InboxFilters({ filters, onFiltersChange, notRepliedCount = 0 }: InboxFiltersProps) {
  const channelType = filters.channel_type ?? 'all';
  const status = filters.status ?? '';
  const replied = filters.replied ?? 'all';
  const search = filters.search ?? '';

  // Filtro de status unificado (seleção única): Todos / Abertas / Respondido / Não respondido.
  // Os status Pendentes/Fechadas/Adiadas foram removidos (não estavam em uso).
  const statusOptions: { key: string; label: string; apply: InboxFiltersProps['filters'] }[] = [
    { key: 'all', label: 'Todos', apply: { status: undefined, replied: 'all' } },
    { key: 'open', label: 'Abertas', apply: { status: 'open', replied: 'all' } },
    { key: 'not_replied', label: 'Não respondido', apply: { status: undefined, replied: 'not_replied' } },
    { key: 'replied', label: 'Respondido', apply: { status: undefined, replied: 'replied' } },
    { key: 'finalized', label: 'Finalizadas', apply: { status: 'closed', replied: 'all' } },
  ];
  const activeStatus =
    replied === 'replied'
      ? 'replied'
      : replied === 'not_replied'
        ? 'not_replied'
        : status === 'closed'
          ? 'finalized'
          : status === 'open'
            ? 'open'
            : 'all';

  return (
    <div className="p-3 border-b border-white/5 space-y-2 bg-[#0f0f1e]">
      {/* Pesquisar conversa */}
      <div>
        <label htmlFor="inbox-search" className="sr-only">
          Pesquisar conversa
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden />
          <input
            id="inbox-search"
            type="search"
            placeholder="Pesquisar por nome, telefone, @..."
            value={search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6] focus:border-[#8b5cf6]"
          />
        </div>
      </div>

      {/* Canal */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Canal</p>
        <div className={ROW}>
          {[
            { label: 'Todos', value: 'all' as const, icon: null },
            { label: 'WhatsApp', value: 'whatsapp' as const, icon: 'whatsapp' },
            { label: 'WhatsApp Web', value: 'whatsapp_baileys' as const, icon: 'whatsapp' },
            { label: 'Instagram', value: 'instagram' as const, icon: 'instagram' },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onFiltersChange({ ...filters, channel_type: tab.value })}
              className={CHIP}
              style={chipStyle(channelType === tab.value)}
            >
              {tab.icon === 'whatsapp' && <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />}
              {tab.icon === 'instagram' && <Instagram className="w-3.5 h-3.5 text-pink-500" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status (inclui respondido / não respondido) */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Status</p>
        <div className={ROW}>
          {statusOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onFiltersChange({ ...filters, ...opt.apply })}
              className={CHIP}
              style={chipStyle(activeStatus === opt.key)}
            >
              {opt.label}
              {opt.key === 'not_replied' && notRepliedCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full bg-red-500 text-white">
                  {notRepliedCount > 99 ? '99+' : notRepliedCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
