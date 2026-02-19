'use client';

import { useConversations } from '@/hooks/useConversations';
import { ConversationList } from '../inbox/ConversationList';
import { InboxFilters } from '../inbox/InboxFilters';
import { useState } from 'react';

export function Sidebar() {
  const [filters, setFilters] = useState<{
    status?: string;
    assigned_to?: string;
    channel_id?: string;
  }>({});
  const { conversations, loading } = useConversations(filters);

  return (
    <div className="flex flex-col h-full w-80 border-r bg-background">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold">MonsterChat</h1>
        <p className="text-sm text-muted-foreground">Inbox Unificado</p>
      </div>
      <InboxFilters filters={filters} onFiltersChange={setFilters} />
      <div className="flex-1 overflow-y-auto">
        <ConversationList conversations={conversations} loading={loading} />
      </div>
    </div>
  );
}
