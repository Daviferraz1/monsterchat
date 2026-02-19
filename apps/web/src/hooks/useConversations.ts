import { useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';
import type { Conversation } from '@/types';

export type ChannelTypeFilter = 'all' | 'whatsapp' | 'instagram';
export type RepliedFilter = 'all' | 'replied' | 'not_replied';

const VALID_STATUSES = ['open', 'pending', 'closed', 'snoozed'] as const;

export function useConversations(filters?: {
  status?: string;
  assigned_to?: string;
  channel_id?: string;
  channel_type?: ChannelTypeFilter;
  replied?: RepliedFilter;
}) {
  const supabase = useSupabase();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const statusFilter = filters?.status != null ? String(filters.status).trim() : '';
  const applyStatus =
    statusFilter !== '' &&
    statusFilter !== 'all' &&
    VALID_STATUSES.includes(statusFilter as (typeof VALID_STATUSES)[number]);

  const repliedFilter = filters?.replied ?? 'all';

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
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (applyStatus && statusFilter) {
        query = query.eq('status', statusFilter);
      }
      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }
      if (filters?.channel_id) {
        query = query.eq('channel_id', filters.channel_id);
      }
      if (repliedFilter === 'replied') {
        query = query.not('last_agent_reply_at', 'is', null);
      } else if (repliedFilter === 'not_replied') {
        query = query.is('last_agent_reply_at', null);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading conversations:', error);
        setLoading(false);
        return;
      }

      let list = data || [];
      if (filters?.channel_type && filters.channel_type !== 'all') {
        list = list.filter(
          (c) => (c as Conversation).channel?.type === filters.channel_type
        );
      }
      setConversations(list);
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
  }, [supabase, statusFilter, applyStatus, repliedFilter, filters?.assigned_to, filters?.channel_id, filters?.channel_type]);

  return { conversations, loading };
}
