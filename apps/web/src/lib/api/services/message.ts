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

/**
 * content_type aceitos pelo CHECK da tabela (migração 004).
 * Manter em sincronia: um valor fora daqui faz o insert estourar e a mensagem some.
 */
const CONTENT_TYPES_PERMITIDOS = new Set([
  'text', 'image', 'video', 'audio', 'document', 'sticker', 'location',
  'contact_card', 'story_mention', 'story_reply', 'template', 'interactive', 'reaction',
]);

/**
 * Garante um content_type válido.
 *
 * Os webhooks geravam 'unsupported' (e 'ephemeral', no anexo temporário do Instagram) para
 * o que não sabiam classificar. Nenhum dos dois passa no CHECK, então o insert era rejeitado
 * e a mensagem sumia sem deixar rastro — a conversa ficava com um buraco e ninguém via erro.
 * Melhor gravar como texto com o aviso do que perder a mensagem.
 */
function normalizeContentType(contentType: string): string {
  if (CONTENT_TYPES_PERMITIDOS.has(contentType)) return contentType;
  console.warn(`[Message] content_type "${contentType}" não é aceito pelo banco; gravando como texto.`);
  return 'text';
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
      content_type: normalizeContentType(data.contentType),
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
