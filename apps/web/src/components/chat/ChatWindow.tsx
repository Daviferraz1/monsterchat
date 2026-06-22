'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useSupabase } from '@/hooks/useSupabase';
import { useAutopilot } from '@/hooks/useAutopilot';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { ChatHeader } from './ChatHeader';
import { useParams } from 'next/navigation';
import { RefreshCw, Bot } from 'lucide-react';

export function ChatWindow() {
  const params = useParams();
  const conversationId = params?.id as string | null;
  const supabase = useSupabase();
  const { enabled: autopilotEnabled, suggestionEnabled } = useAutopilot();
  const { messages, refresh } = useRealtimeMessages(conversationId);
  const [refreshing, setRefreshing] = useState(false);
  const [contactAvatarUrl, setContactAvatarUrl] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Foto do contato — usada nos voice notes (estilo WhatsApp)
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    supabase
      .from('conversations')
      .select('contact:contacts(profile_pic_url)')
      .eq('id', conversationId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        const url =
          (data as { contact?: { profile_pic_url?: string | null } } | null)?.contact?.profile_pic_url ?? null;
        setContactAvatarUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, supabase]);

  // Ao abrir a conversa ou receber novas mensagens, rolar até o final
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }, [conversationId, messages.length]);

  const lastInboundBody = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.direction === 'inbound' && m.body?.trim()) return m.body;
    }
    return null;
  }, [messages]);

  const lastOutboundSender = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.direction === 'outbound') return m.sender_type ?? null;
    }
    return null;
  }, [messages]);

  /** Última mensagem é do operador/bot → não sugerir resposta (evita gastar IA). */
  const lastMessageFromOperator = useMemo(
    () => messages.length > 0 && messages[messages.length - 1].direction === 'outbound',
    [messages]
  );

  const operatorTookOver = lastOutboundSender === 'agent';
  const [returningToBot, setReturningToBot] = useState(false);
  const handleReturnToBot = async () => {
    if (!conversationId || returningToBot) return;
    setReturningToBot(true);
    try {
      const res = await fetch('/api/ia/return-to-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      if (res.ok) await refresh();
      else console.error('Falha ao devolver para IA');
    } finally {
      setReturningToBot(false);
    }
  };

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
      {autopilotEnabled && operatorTookOver && (
        <div className="shrink-0 px-3 py-2 flex items-center justify-center gap-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
          <span>Você assumiu esta conversa. A IA não responderá até você devolver.</span>
          <button
            type="button"
            onClick={handleReturnToBot}
            disabled={returningToBot}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-200 hover:bg-amber-300 font-medium disabled:opacity-50"
          >
            <Bot className="w-4 h-4" />
            Devolver para IA
          </button>
        </div>
      )}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-4 overscroll-behavior-contain"
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} contactAvatarUrl={contactAvatarUrl} />
        ))}
      </div>
      <MessageInput
        conversationId={conversationId}
        lastInboundBody={lastInboundBody}
        suggestionEnabled={suggestionEnabled}
        lastMessageFromOperator={lastMessageFromOperator}
      />
    </div>
  );
}
