import { useEffect, useState, useCallback, useRef } from 'react';
import { useSupabase } from './useSupabase';
import { startPolling, POLL_MESSAGES_MS } from '@/lib/polling';
import { MESSAGE_SELECT, MESSAGES_PAGE } from '@/lib/queries';
import type { Message } from '@/types';

/**
 * Ordem por data e, no empate, por id: duas mensagens gravadas no mesmo instante
 * não podem trocar de lugar a cada recarga.
 */
function byCreatedAt(a: Message, b: Message): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Junta o que chegou com o que já está na tela, sem duplicar nem perder as antigas já carregadas. */
function merge(previous: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return previous;
  const byId = new Map(previous.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(byCreatedAt);
}

/**
 * A linha que chega pelo tempo real traz `metadata` inteiro; a que vem pela
 * busca traz só as duas chaves de reação, já com nome próprio (ver
 * `MESSAGE_SELECT`). Normaliza para o chat não precisar saber de onde veio.
 */
function fromRealtime(raw: Record<string, unknown>): Message {
  const meta = (raw.metadata ?? null) as { reaction?: { message_id?: string }; mid?: string } | null;
  return {
    ...(raw as unknown as Message),
    reaction_meta: meta?.reaction ?? null,
    reaction_mid: meta?.mid ?? null,
  };
}

/**
 * Mensagens da conversa aberta.
 *
 * Carrega a janela recente, não o histórico inteiro: antes eram `select('*')`
 * com `limit(10000)` a cada segundo, ou seja, uma conversa de meses descia
 * inteira, com o payload cru do webhook junto, 60 vezes por minuto. Agora desce
 * a última página, sem `metadata`, e as antigas só quando alguém pede.
 */
export function useRealtimeMessages(conversationId: string | null) {
  const supabase = useSupabase();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Se `hasOlder` já foi decidido para esta conversa (só a primeira busca decide). */
  const initialized = useRef(false);
  /**
   * Conversa aberta agora. Como o resultado é mesclado com o que está na tela,
   * uma resposta que chega atrasada depois da troca de conversa misturaria as
   * duas — este guarda-chuva a descarta.
   */
  const activeConversation = useRef<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE);

    if (error) {
      console.error('Error loading messages:', error);
      return;
    }
    if (activeConversation.current !== conversationId) return;
    const page = ((data || []) as unknown as Message[]).slice().reverse();
    setMessages((previous) => merge(previous, page));
    if (!initialized.current) {
      initialized.current = true;
      setHasOlder(page.length === MESSAGES_PAGE);
    }
  }, [conversationId, supabase]);

  /** Página anterior à mensagem mais antiga já carregada. */
  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder) return;
    const oldest = messages[0];
    if (!oldest) return;

    setLoadingOlder(true);
    const { data, error } = await supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PAGE);
    setLoadingOlder(false);

    if (error) {
      console.error('Error loading older messages:', error);
      return;
    }
    if (activeConversation.current !== conversationId) return;
    const page = ((data || []) as unknown as Message[]).slice().reverse();
    setHasOlder(page.length === MESSAGES_PAGE);
    setMessages((previous) => merge(previous, page));
  }, [conversationId, supabase, messages, loadingOlder]);

  useEffect(() => {
    initialized.current = false;
    activeConversation.current = conversationId;
    setHasOlder(false);
    setMessages([]);

    if (!conversationId) return;

    loadMessages();

    const stopPolling = startPolling(loadMessages, POLL_MESSAGES_MS);

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
            const newRow = fromRealtime(raw);
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
            const newRow = fromRealtime(raw);
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
      stopPolling();
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase, loadMessages]);

  return { messages, refresh: loadMessages, loadOlder, hasOlder, loadingOlder };
}
