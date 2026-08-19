import { supabaseAdmin } from '../supabase';

export interface MessageData {
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderType: 'contact' | 'agent' | 'system' | 'bot';
  senderId?: string;
  /** Operador logado que enviou (outbound/agent). Base das estatísticas por atendente. */
  agentUserId?: string | null;
  contentType: string;
  body?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaSize?: number;
  externalId?: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  replyToId?: string;
  metadata?: Record<string, any>;
}

export async function createMessage(data: MessageData) {
  const { data: message, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: data.conversationId,
      direction: data.direction,
      sender_type: data.senderType,
      sender_id: data.senderId,
      agent_user_id: data.agentUserId ?? null,
      content_type: data.contentType,
      body: data.body,
      media_url: data.mediaUrl,
      media_mime_type: data.mediaMimeType,
      media_filename: data.mediaFilename,
      media_size: data.mediaSize,
      external_id: data.externalId,
      status: data.status || 'pending',
      error_message: data.errorMessage,
      reply_to_id: data.replyToId,
      metadata: data.metadata || {},
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating message:', error);
    throw error;
  }

  return message;
}

export async function getMessageByExternalId(externalId: string) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('external_id', externalId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Atualiza o status de uma mensagem pelo external_id.
 * Retorna a mensagem atualizada ou null se não existir (ex.: status chegou antes da mensagem no banco).
 */
export async function updateMessageStatus(
  externalId: string,
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed',
  errorMessage?: string
) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .update({
      status,
      error_message: errorMessage,
    })
    .eq('external_id', externalId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating message status:', error);
    throw error;
  }

  return data;
}
