import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from './useSupabase';
import type { Message } from '@/types';

const POLL_INTERVAL_MS = 4000;

export function useRealtimeMessages(conversationId: string | null) {
  const supabase = useSupabase();
  const [messages, setMessages] = useState<Message[]>([]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

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

    // Fallback: refetch periódico caso o Realtime não entregue (ex.: primeiro acesso, RLS, etc.)
    const interval = setInterval(loadMessages, POLL_INTERVAL_MS);

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
          const newRow = (payload as { new?: Message }).new ?? (payload as { record?: Message }).record;
          if (newRow) {
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
          const newRow = (payload as { new?: Message }).new ?? (payload as { record?: Message }).record;
          if (newRow) {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === newRow.id ? newRow : msg))
            );
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, loadMessages]);

  return messages;
}
