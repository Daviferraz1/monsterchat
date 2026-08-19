'use client';

import { useState } from 'react';
import { useConversations } from '@/hooks/useConversations';
import { ConversationList } from '../inbox/ConversationList';
import { InboxFilters } from '../inbox/InboxFilters';
import type { AssignmentFilter, ChannelTypeFilter, RepliedFilter } from '@/hooks/useConversations';

export function MobileInboxContent() {
  const [filters, setFilters] = useState<{
    status?: string;
    assigned_to?: string;
    channel_id?: string;
    channel_type?: ChannelTypeFilter;
    replied?: RepliedFilter;
    department_id?: string;
    assignment?: AssignmentFilter;
    search?: string;
  }>({});
  const { conversations, loading, notRepliedCount } = useConversations(filters);

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0d0d1a]" style={{ color: '#e2e8f0' }}>
      <header className="shrink-0 border-b border-white/10 bg-[#0a0a18] px-4 py-3">
        <h1 className="text-xl font-bold text-white">Conversas</h1>
        <p className="text-xs text-gray-500 mt-0.5">MonsterChat · Inbox unificado</p>
      </header>
      <InboxFilters
        filters={filters}
        onFiltersChange={setFilters}
        notRepliedCount={notRepliedCount}
      />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarColor: '#333 transparent' }}>
        <ConversationList
          conversations={conversations}
          loading={loading}
          channelTypeFilter={filters.channel_type}
        />
      </div>
    </div>
  );
}
