'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConversations } from '@/hooks/useConversations';
import { ConversationList } from '../inbox/ConversationList';
import { InboxFilters } from '../inbox/InboxFilters';
import { useState } from 'react';
import { MessageSquare, Settings, Users, ShoppingBag } from 'lucide-react';
import { UserProfile } from './UserProfile';

export function Sidebar() {
  const pathname = usePathname();
  const [filters, setFilters] = useState<{
    status?: string;
    assigned_to?: string;
    channel_id?: string;
    channel_type?: 'all' | 'whatsapp' | 'instagram';
    replied?: 'all' | 'replied' | 'not_replied';
    search?: string;
  }>({});
  const { conversations, loading } = useConversations(filters);

  return (
    <div className="flex flex-col h-full w-80 border-r bg-[#0a0a18]" style={{ color: '#e2e8f0' }}>
      <div className="p-4 border-b border-white/5">
        <h1 className="text-xl font-bold text-white">MonsterChat</h1>
        <p className="text-xs text-gray-500">Inbox Unificado</p>
        <nav className="flex gap-1 mt-3">
          <Link
            href="/inbox"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              pathname?.startsWith('/inbox')
                ? 'bg-[rgba(139,92,246,0.25)] text-[#a78bfa]'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" /> Inbox
          </Link>
          <Link
            href="/contacts"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              pathname?.startsWith('/contacts')
                ? 'bg-[rgba(139,92,246,0.25)] text-[#a78bfa]'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <Users className="w-4 h-4" /> Contatos
          </Link>
          <Link
            href="/sales"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              pathname?.startsWith('/sales')
                ? 'bg-[rgba(139,92,246,0.25)] text-[#a78bfa]'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" /> Últimas vendas
          </Link>
          <Link
            href="/settings/channels"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              pathname?.startsWith('/settings')
                ? 'bg-[rgba(139,92,246,0.25)] text-[#a78bfa]'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <Settings className="w-4 h-4" /> Canais
          </Link>
        </nav>
      </div>
      <InboxFilters filters={filters} onFiltersChange={setFilters} />
      <div className="flex-1 overflow-y-auto bg-[#0d0d1a]" style={{ scrollbarColor: '#333 transparent' }}>
        <ConversationList
          conversations={conversations}
          loading={loading}
          channelTypeFilter={filters.channel_type}
        />
      </div>
      <UserProfile />
    </div>
  );
}
