'use client';

import { useEffect, useState } from 'react';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useSupabase } from '@/hooks/useSupabase';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ChatHeader } from './ChatHeader';
import { useParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function ChatWindow() {
  const params = useParams();
  const conversationId = params?.id as string | null;
  const supabase = useSupabase();
  const { messages, refresh } = useRealtimeMessages(conversationId);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Marcar conversa como lida ao abrir
  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('conversations')
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .then(({ error }) => {
        if (error) console.error('Error marking conversation as read:', error);
      });
  }, [conversationId, supabase]);

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Selecione uma conversa para começar
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ChatHeader conversationId={conversationId} />
      <div className="flex items-center justify-end px-2 py-1.5 border-b bg-muted/30 shrink-0">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 min-h-[44px] text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          title="Atualizar mensagens"
        >
          <RefreshCw className={`w-4 h-4 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{refreshing ? 'Atualizando...' : 'Atualizar mensagens'}</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-4 overscroll-behavior-contain">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
      <MessageInput conversationId={conversationId} />
    </div>
  );
}
