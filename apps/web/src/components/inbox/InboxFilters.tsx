'use client';

import { MessageCircle, Instagram } from 'lucide-react';
import type { ChannelTypeFilter, RepliedFilter } from '@/hooks/useConversations';

interface InboxFiltersProps {
  filters: {
    status?: string;
    assigned_to?: string;
    channel_id?: string;
    channel_type?: ChannelTypeFilter;
    replied?: RepliedFilter;
  };
  onFiltersChange: (filters: InboxFiltersProps['filters']) => void;
}

export function InboxFilters({ filters, onFiltersChange }: InboxFiltersProps) {
  const channelType = filters.channel_type ?? 'all';
  const status = filters.status ?? '';
  const replied = filters.replied ?? 'all';

  return (
    <div className="p-4 border-b border-white/5 space-y-3 bg-[#0f0f1e]">
      {/* Abas por canal */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Canal</p>
        <div className="flex gap-1.5">
          {[
            { label: 'Todos', value: 'all' as const, icon: null },
            { label: 'WhatsApp', value: 'whatsapp' as const, icon: 'whatsapp' },
            { label: 'Instagram', value: 'instagram' as const, icon: 'instagram' },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onFiltersChange({ ...filters, channel_type: tab.value })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: channelType === tab.value ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                color: channelType === tab.value ? '#a78bfa' : '#94a3b8',
              }}
            >
              {tab.icon === 'whatsapp' && <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />}
              {tab.icon === 'instagram' && <Instagram className="w-3.5 h-3.5 text-pink-500" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Status</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Todos', value: '' },
            { label: 'Abertas', value: 'open' },
            { label: 'Pendentes', value: 'pending' },
            { label: 'Fechadas', value: 'closed' },
            { label: 'Adiadas', value: 'snoozed' },
          ].map((opt) => {
            const isSelected = status === opt.value;
            return (
              <button
                key={opt.value || 'all'}
                type="button"
                onClick={() =>
                  onFiltersChange({ ...filters, status: opt.value === '' ? undefined : opt.value })
                }
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: isSelected ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color: isSelected ? '#a78bfa' : '#94a3b8',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Respondido / Não respondido */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Respondido</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: 'Todos', value: 'all' as const },
            { label: 'Respondido', value: 'replied' as const },
            { label: 'Não respondido', value: 'not_replied' as const },
          ].map((opt) => {
            const isSelected = replied === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFiltersChange({ ...filters, replied: opt.value })}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: isSelected ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                  color: isSelected ? '#a78bfa' : '#94a3b8',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
