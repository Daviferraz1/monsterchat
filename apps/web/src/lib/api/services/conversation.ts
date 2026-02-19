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
  // Buscar conversa existente
  const { data: existing } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('channel_id', data.channelId)
    .eq('contact_id', data.contactId)
    .single();

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
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
