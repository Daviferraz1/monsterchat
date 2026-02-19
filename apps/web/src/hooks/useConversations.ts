import { useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';
import type { Conversation } from '@/types';

export function useConversations(filters?: {
  status?: string;
  assigned_to?: string;
  channel_id?: string;
}) {
  const supabase = useSupabase();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConversations = async () => {
      setLoading(true);
      let query = supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts(*),
          channel:channels(*)
        `)
        .order('last_message_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }
      if (filters?.channel_id) {
        query = query.eq('channel_id', filters.channel_id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading conversations:', error);
        setLoading(false);
        return;
      }

      setConversations(data || []);
      setLoading(false);
    };

    loadConversations();

    // Inscrever em atualizações de conversas
    const channel = supabase
      .channel('conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, filters?.status, filters?.assigned_to, filters?.channel_id]);

  return { conversations, loading };
}
