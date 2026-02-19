'use client';

import { ConversationItem } from './ConversationItem';
import type { Conversation } from '@/types';

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
}

export function ConversationList({ conversations, loading }: ConversationListProps) {
  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Carregando conversas...
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Nenhuma conversa encontrada
      </div>
    );
  }

  return (
    <div className="divide-y">
      {conversations.map((conversation) => (
        <ConversationItem key={conversation.id} conversation={conversation} />
      ))}
    </div>
  );
}
