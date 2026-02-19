'use client';

import { ConversationItem } from './ConversationItem';
import { ChannelBadge } from '../layout/ChannelBadge';
import type { Conversation } from '@/types';
import type { ChannelTypeFilter } from '@/hooks/useConversations';

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  /** Quando 'all', lista única (ordem = msg recente); quando whatsapp/instagram, agrupa por canal */
  channelTypeFilter?: ChannelTypeFilter;
}

function groupByChannel(conversations: Conversation[]): { channelId: string; channelName: string; channelType: 'whatsapp' | 'instagram'; items: Conversation[] }[] {
  const map = new Map<string, Conversation[]>();
  const channelMeta = new Map<string, { name: string; type: 'whatsapp' | 'instagram' }>();

  for (const c of conversations) {
    const id = c.channel_id;
    if (!map.has(id)) {
      map.set(id, []);
      channelMeta.set(id, {
        name: c.channel?.name || (c.channel?.type === 'whatsapp' ? 'WhatsApp' : 'Instagram'),
        type: c.channel?.type || 'whatsapp',
      });
    }
    map.get(id)!.push(c);
  }

  return Array.from(map.entries()).map(([channelId, items]) => ({
    channelId,
    channelName: channelMeta.get(channelId)!.name,
    channelType: channelMeta.get(channelId)!.type,
    items,
  }));
}

export function ConversationList({ conversations, loading, channelTypeFilter = 'all' }: ConversationListProps) {
  if (loading) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Carregando conversas...
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Nenhuma conversa encontrada
      </div>
    );
  }

  const showGroups = channelTypeFilter !== 'all';

  if (!showGroups) {
    return (
      <div className="divide-y divide-white/5">
        {conversations.map((conversation) => (
          <ConversationItem key={conversation.id} conversation={conversation} />
        ))}
      </div>
    );
  }

  const groups = groupByChannel(conversations);

  return (
    <div className="divide-y divide-white/5">
      {groups.map((group) => (
        <div key={group.channelId}>
          <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-[#0d0d1a] border-b border-white/5">
            <ChannelBadge type={group.channelType} className="w-5 h-5 flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-300 truncate">{group.channelName}</span>
            <span className="text-[10px] text-gray-500 ml-auto flex-shrink-0">{group.items.length}</span>
          </div>
          {group.items.map((conversation) => (
            <ConversationItem key={conversation.id} conversation={conversation} />
          ))}
        </div>
      ))}
    </div>
  );
}
