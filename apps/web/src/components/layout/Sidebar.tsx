'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConversations } from '@/hooks/useConversations';
import { ConversationList } from '../inbox/ConversationList';
import { InboxFilters } from '../inbox/InboxFilters';
import { useState } from 'react';
import { MessageSquare, Settings } from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
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
        <nav className="flex gap-1 mt-3">
          <Link
            href="/inbox"
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
              pathname?.startsWith('/inbox') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Inbox
          </Link>
          <Link
            href="/settings/channels"
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
              pathname?.startsWith('/settings') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            }`}
          >
            <Settings className="w-4 h-4" /> Canais
          </Link>
        </nav>
      </div>
      <InboxFilters filters={filters} onFiltersChange={setFilters} />
      <div className="flex-1 overflow-y-auto">
        <ConversationList conversations={conversations} loading={loading} />
      </div>
    </div>
  );
}
