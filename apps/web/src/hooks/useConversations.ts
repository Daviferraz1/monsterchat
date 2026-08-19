import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from './useSupabase';
import { useTeamDirectory } from './useTeamDirectory';
import { needsReply } from '@/lib/conversationStatus';
import type { Conversation } from '@/types';

export type ChannelTypeFilter = 'all' | 'whatsapp' | 'whatsapp_baileys' | 'instagram';
export type RepliedFilter = 'all' | 'replied' | 'not_replied';
/** Só as que o atendente marcou para voltar depois. */
export type UnreadFilter = 'all' | 'marked';
/** Fila: todas as visíveis, só as minhas, ou as que ainda não têm dono. */
export type AssignmentFilter = 'all' | 'mine' | 'unassigned';

const VALID_STATUSES = ['open', 'pending', 'closed', 'snoozed'] as const;

export function useConversations(filters?: {
  status?: string;
  assigned_to?: string;
  channel_id?: string;
  channel_type?: ChannelTypeFilter;
  replied?: RepliedFilter;
  unread?: UnreadFilter;
  department_id?: string;
  assignment?: AssignmentFilter;
  search?: string;
}) {
  const supabase = useSupabase();
  const { me } = useTeamDirectory();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [notRepliedCount, setNotRepliedCount] = useState(0);

  const statusFilter = filters?.status != null ? String(filters.status).trim() : '';
  const applyStatus =
    statusFilter !== '' &&
    statusFilter !== 'all' &&
    VALID_STATUSES.includes(statusFilter as (typeof VALID_STATUSES)[number]);

  const repliedFilter = filters?.replied ?? 'all';
  const unreadFilter = filters?.unread ?? 'all';
  const departmentFilter = filters?.department_id ?? '';
  const assignmentFilter = filters?.assignment ?? 'all';
  const myUserId = me?.userId ?? '';
  const searchQuery = (filters?.search ?? '').trim().toLowerCase();

  useEffect(() => {
    const loadConversations = async (showLoading = true) => {
      if (showLoading) setLoading(true);
      let query = supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts(*),
          channel:channels(*)
        `)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }
      if (filters?.channel_id) {
        query = query.eq('channel_id', filters.channel_id);
      }
      if (departmentFilter) {
        query = query.eq('department_id', departmentFilter);
      }
      if (assignmentFilter === 'unassigned') {
        query = query.is('assigned_to', null);
      } else if (assignmentFilter === 'mine') {
        // Sem usuário resolvido ainda, não filtra (evita lista vazia no primeiro render).
        if (myUserId) query = query.eq('assigned_to', myUserId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading conversations:', error);
        setLoading(false);
        return;
      }

      let list = data || [];
      if (filters?.channel_type && filters.channel_type !== 'all') {
        list = list.filter((c) => {
          const channelType = (c as Conversation).channel?.type;
          if (filters.channel_type === 'whatsapp') {
            return channelType === 'whatsapp' || channelType === 'whatsapp_baileys';
          }
          return channelType === filters.channel_type;
        });
      }
      // Contagem de "não respondidas" — sobre o canal atual, antes dos filtros de status/respondido,
      // para o badge ficar estável independente do chip selecionado.
      setNotRepliedCount(list.filter((c) => needsReply(c as Conversation)).length);

      // Filtro de status (cliente): Abertas / Finalizadas (closed).
      // "Abertas" = tudo que NÃO foi finalizado. Desde o Quadro, uma conversa em
      // andamento fica como 'pending' e uma aguardando como 'snoozed'; elas seguem
      // abertas para o atendimento, só mudaram de raia — não podem sumir do inbox.
      if (applyStatus && statusFilter) {
        list = list.filter((c) =>
          statusFilter === 'open'
            ? (c as Conversation).status !== 'closed'
            : (c as Conversation).status === statusFilter
        );
      }
      // "Não respondido" = última mensagem foi do contato e não foi respondida (e não finalizada).
      // "Respondido" = o complemento (já respondida ou finalizada).
      if (repliedFilter === 'not_replied') {
        list = list.filter((c) => needsReply(c as Conversation));
      } else if (repliedFilter === 'replied') {
        list = list.filter((c) => !needsReply(c as Conversation));
      }
      if (unreadFilter === 'marked') {
        list = list.filter((c) => (c as Conversation).manually_unread);
      }
      setConversations(list);
      setLoading(false);
    };

    loadConversations(true);

    const pollInterval = setInterval(() => loadConversations(false), 2000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadConversations(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

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
          loadConversations(false);
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [
    supabase,
    statusFilter,
    applyStatus,
    repliedFilter,
    unreadFilter,
    departmentFilter,
    assignmentFilter,
    myUserId,
    filters?.assigned_to,
    filters?.channel_id,
    filters?.channel_type,
  ]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    const needle = searchQuery;
    return conversations.filter((c) => {
      const name = c.contact?.name ?? '';
      const phone = c.contact?.phone ?? '';
      const externalId = c.contact?.external_id ?? '';
      const username = (c.contact?.metadata as { username?: string } | undefined)?.username ?? '';
      const preview = c.last_message_preview ?? '';
      return (
        name.toLowerCase().includes(needle) ||
        phone.includes(needle) ||
        externalId.includes(needle) ||
        username.toLowerCase().includes(needle) ||
        preview.toLowerCase().includes(needle)
      );
    });
  }, [conversations, searchQuery]);

  return { conversations: filteredConversations, loading, notRepliedCount };
}
