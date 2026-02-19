'use client';

import { useEffect } from 'react';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useSupabase } from '@/hooks/useSupabase';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ChatHeader } from './ChatHeader';
import { useParams } from 'next/navigation';

export function ChatWindow() {
  const params = useParams();
  const conversationId = params?.id as string | null;
  const supabase = useSupabase();
  const messages = useRealtimeMessages(conversationId);

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
    <div className="flex flex-col h-full">
      <ChatHeader conversationId={conversationId} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
      <MessageInput conversationId={conversationId} />
    </div>
  );
}
