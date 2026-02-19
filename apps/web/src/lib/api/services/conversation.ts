import { supabaseAdmin } from '../supabase';

export interface ConversationData {
  channelId: string;
  contactId: string;
}

export interface ConversationUpdate {
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
  status?: 'open' | 'pending' | 'closed' | 'snoozed';
}

export async function findOrCreateConversation(data: ConversationData) {
  // Buscar conversa existente (maybeSingle: 0 linhas não é erro)
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('channel_id', data.channelId)
    .eq('contact_id', data.contactId)
    .maybeSingle();

  if (selectError) {
    console.error('[Conversation] Erro ao buscar conversa:', selectError);
    throw selectError;
  }
  if (existing) {
    return existing;
  }

  // Criar nova conversa
  const { data: created, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      channel_id: data.channelId,
      contact_id: data.contactId,
      status: 'open',
      unread_count: 0,
    })
    .select()
    .single();

  if (error) throw error;
  return created;
}

export async function updateConversation(conversationId: string, updates: ConversationUpdate) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.lastMessageAt !== undefined) payload.last_message_at = updates.lastMessageAt;
  if (updates.lastMessagePreview !== undefined) payload.last_message_preview = updates.lastMessagePreview;
  if (updates.unreadCount !== undefined) payload.unread_count = updates.unreadCount;
  if (updates.status !== undefined) payload.status = updates.status;

  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update(payload)
    .eq('id', conversationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
