'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConversations } from '@/hooks/useConversations';
import { ConversationList } from '../inbox/ConversationList';
import { InboxFilters } from '../inbox/InboxFilters';
import { useState } from 'react';
import { MessageSquare, Settings, Users, ShoppingBag, CreditCard, Megaphone, Bot, BookOpen, Mail, UsersRound, KanbanSquare } from 'lucide-react';
import { UserProfile } from './UserProfile';
import { useTeamDirectory } from '@/hooks/useTeamDirectory';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export function Sidebar({ isOpen = true, onClose, className = '' }: SidebarProps) {
  const pathname = usePathname();
  const [filters, setFilters] = useState<{
    status?: string;
    assigned_to?: string;
    channel_id?: string;
    channel_type?: 'all' | 'whatsapp' | 'whatsapp_baileys' | 'instagram';
    replied?: 'all' | 'replied' | 'not_replied';
    department_id?: string;
    assignment?: 'all' | 'mine' | 'unassigned';
    search?: string;
  }>({});
  const { conversations, loading } = useConversations(filters);
  const { me } = useTeamDirectory();

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px] min-w-[44px] ${
      active ? 'bg-[rgba(139,92,246,0.25)] text-[#a78bfa]' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
    }`;

  return (
    <aside
      className={`flex flex-col h-full border-r bg-[#0a0a18] z-50 md:z-auto transition-transform duration-200 ease-out
        fixed inset-y-0 left-0 w-[min(320px,85vw)] md:relative md:inset-auto md:w-80
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        ${className}`}
      style={{ color: '#e2e8f0' }}
      aria-hidden={!isOpen}
    >
      <div className="p-4 border-b border-white/5">
        <h1 className="text-xl font-bold text-white">MonsterChat</h1>
        <p className="text-xs text-gray-500">Inbox Unificado</p>
        <nav className="flex flex-col gap-1 mt-3">
          <Link href="/inbox" className={navLinkClass(!!pathname?.startsWith('/inbox'))} onClick={onClose}>
            <MessageSquare className="w-4 h-4 shrink-0" /> Inbox
          </Link>
          <Link href="/quadro" className={navLinkClass(!!pathname?.startsWith('/quadro'))} onClick={onClose}>
            <KanbanSquare className="w-4 h-4 shrink-0" /> Quadro
          </Link>
          <Link href="/contacts" className={navLinkClass(!!pathname?.startsWith('/contacts'))} onClick={onClose}>
            <Users className="w-4 h-4 shrink-0" /> Contatos
          </Link>
          <Link href="/sales" className={navLinkClass(!!pathname?.startsWith('/sales'))} onClick={onClose}>
            <ShoppingBag className="w-4 h-4 shrink-0" /> Últimas vendas
          </Link>
          <Link href="/subscriptions" className={navLinkClass(!!pathname?.startsWith('/subscriptions'))} onClick={onClose}>
            <CreditCard className="w-4 h-4 shrink-0" /> Assinaturas
          </Link>
          <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Configurações
          </p>
          {me?.isManager && (
            <Link href="/settings/equipe" className={navLinkClass(!!pathname?.startsWith('/settings/equipe'))} onClick={onClose}>
              <UsersRound className="w-4 h-4 shrink-0" /> Equipe
            </Link>
          )}
          <Link href="/settings/channels" className={navLinkClass(pathname === '/settings/channels')} onClick={onClose}>
            <Settings className="w-4 h-4 shrink-0" /> Canais
          </Link>
          <Link href="/settings/campanhas" className={navLinkClass(pathname === '/settings/campanhas')} onClick={onClose}>
            <Megaphone className="w-4 h-4 shrink-0" /> Campanhas
          </Link>
          <Link href="/settings/ia" className={navLinkClass(!!pathname?.startsWith('/settings/ia'))} onClick={onClose}>
            <Bot className="w-4 h-4 shrink-0" /> IA Atendimento
          </Link>
          <Link href="/settings/resend" className={navLinkClass(!!pathname?.startsWith('/settings/resend'))} onClick={onClose}>
            <Mail className="w-4 h-4 shrink-0" /> E-mails (Resend)
          </Link>
        </nav>
      </div>
      <InboxFilters filters={filters} onFiltersChange={setFilters} />
      <div className="flex-1 overflow-y-auto bg-[#0d0d1a]" style={{ scrollbarColor: '#333 transparent' }}>
        <ConversationList
          conversations={conversations}
          loading={loading}
          channelTypeFilter={filters.channel_type}
          onConversationClick={onClose}
        />
      </div>
      <UserProfile />
    </aside>
  );
}
