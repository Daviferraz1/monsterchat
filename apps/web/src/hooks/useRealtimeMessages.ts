import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from './useSupabase';
import type { Message } from '@/types';

const POLL_INTERVAL_MS = 1000;

export function useRealtimeMessages(conversationId: string | null) {
  const supabase = useSupabase();
  const [messages, setMessages] = useState<Message[]>([]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(10000);

    if (error) {
      console.error('Error loading messages:', error);
      return;
    }
    setMessages(data || []);
  }, [conversationId, supabase]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    loadMessages();

    const interval = setInterval(loadMessages, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadMessages();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const raw = (payload as { new?: Record<string, unknown> }).new ?? (payload as { record?: Record<string, unknown> }).record;
          if (raw && typeof raw.id === 'string') {
            const newRow = raw as unknown as Message;
            setMessages((prev) =>
              prev.some((m) => m.id === newRow.id) ? prev : [...prev, newRow]
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const raw = (payload as { new?: Record<string, unknown> }).new ?? (payload as { record?: Record<string, unknown> }).record;
          if (raw && typeof raw.id === 'string') {
            const newRow = raw as unknown as Message;
            setMessages((prev) =>
              prev.map((msg) => (msg.id === newRow.id ? newRow : msg))
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') loadMessages();
      });

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, loadMessages]);

  return { messages, refresh: loadMessages };
}
