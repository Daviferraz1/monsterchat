import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSupabase } from './useSupabase';
import { useTeamDirectory } from './useTeamDirectory';
import { needsReply } from '@/lib/conversationStatus';
import { startPolling, throttleReload, POLL_CONVERSATIONS_MS } from '@/lib/polling';
import {
  CONVERSATION_LIST_SELECT,
  CONVERSATION_BADGE_SELECT,
  CONVERSATIONS_PAGE,
} from '@/lib/queries';
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
  const channelTypeFilter =
    filters?.channel_type && filters.channel_type !== 'all' ? filters.channel_type : null;

  /**
   * Quantas conversas a lista está mostrando. Cresce no "Carregar mais".
   *
   * Sem teto, a busca voltava as 1000 conversas que o PostgREST devolve no
   * máximo — ~800 KB para preencher uma tela de vinte linhas.
   */
  const [limit, setLimit] = useState(CONVERSATIONS_PAGE);
  const [hasMore, setHasMore] = useState(false);

  /**
   * Status, respondido e busca são filtrados aqui no cliente, depois da consulta.
   * Com um teto de página eles só enxergariam o topo da fila — então, quando um
   * deles está ligado, a lista vem inteira. É um custo pontual, de quando a
   * pessoa clica no filtro, e não a cada recarga.
   */
  const filteringOnClient =
    applyStatus || repliedFilter !== 'all' || unreadFilter !== 'all' || searchQuery !== '';

  useEffect(() => {
    const loadConversations = async (showLoading = true) => {
      if (showLoading) setLoading(true);
      // Filtrar por canal no servidor (e não depois, na memória) exige juntar a
      // tabela de canais com `!inner`: sem isso o PostgREST zera o canal embutido
      // mas devolve a conversa mesmo assim.
      const select = channelTypeFilter
        ? CONVERSATION_LIST_SELECT.replace('channel:channels(', 'channel:channels!inner(')
        : CONVERSATION_LIST_SELECT;

      /** Filtros que valem tanto para a lista quanto para a contagem do badge. */
      const applyCommonFilters = <T extends { eq: any; in: any; is: any }>(q: T): T => {
        let query = q as any;
        if (channelTypeFilter === 'whatsapp') {
          // A aba "WhatsApp" cobre os dois jeitos de conectar: API oficial e Baileys.
          query = query.in('channel.type', ['whatsapp', 'whatsapp_baileys']);
        } else if (channelTypeFilter) {
          query = query.eq('channel.type', channelTypeFilter);
        }
        if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
        if (filters?.channel_id) query = query.eq('channel_id', filters.channel_id);
        if (departmentFilter) query = query.eq('department_id', departmentFilter);
        if (assignmentFilter === 'unassigned') {
          query = query.is('assigned_to', null);
        } else if (assignmentFilter === 'mine') {
          // Sem usuário resolvido ainda, não filtra (evita lista vazia no primeiro render).
          if (myUserId) query = query.eq('assigned_to', myUserId);
        }
        return query as T;
      };

      let listQuery = applyCommonFilters(
        supabase
          .from('conversations')
          .select(select)
          .order('last_message_at', { ascending: false, nullsFirst: false })
      );
      if (!filteringOnClient) listQuery = listQuery.limit(limit);

      // O badge conta a fila inteira, então esta consulta não tem teto — mas leva
      // só as colunas de `needsReply`, que é uma fração do peso da lista.
      const badgeSelect = channelTypeFilter
        ? `${CONVERSATION_BADGE_SELECT}, channel:channels!inner(type)`
        : CONVERSATION_BADGE_SELECT;
      const badgeQuery = applyCommonFilters(
        supabase.from('conversations').select(badgeSelect)
      );

      const [{ data, error }, badgeRes] = await Promise.all([listQuery, badgeQuery]);

      if (error) {
        console.error('Error loading conversations:', error);
        setLoading(false);
        return;
      }

      let list = (data || []) as unknown as Conversation[];
      setHasMore(!filteringOnClient && list.length === limit);
      // Contagem de "não respondidas" — sobre o canal atual, antes dos filtros de status/respondido,
      // para o badge ficar estável independente do chip selecionado.
      if (!badgeRes.error) {
        const todas = (badgeRes.data || []) as unknown as Conversation[];
        setNotRepliedCount(todas.filter((c) => needsReply(c)).length);
      }

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

    const stopPolling = startPolling(() => loadConversations(false), POLL_CONVERSATIONS_MS);

    // Toda mensagem que entra ou sai mexe em `last_message_at`, então numa conta
    // movimentada este evento dispara sem parar — e cada disparo recarrega a
    // lista inteira. O throttle junta a rajada numa recarga só.
    const reload = throttleReload(() => loadConversations(false));

    const channel = supabase
      .channel('conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
        },
        reload
      )
      .subscribe();

    return () => {
      stopPolling();
      reload.cancel();
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
    channelTypeFilter,
    filteringOnClient,
    limit,
    filters?.assigned_to,
    filters?.channel_id,
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

  const loadMore = useCallback(() => setLimit((n) => n + CONVERSATIONS_PAGE), []);

  return { conversations: filteredConversations, loading, notRepliedCount, hasMore, loadMore };
}
