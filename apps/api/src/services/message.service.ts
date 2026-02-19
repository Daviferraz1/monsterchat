import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import type {
  MessageDirection,
  SenderType,
  MessageContentType,
  MessageStatus,
} from '../types/common.types.js';

export interface MessageData {
  conversationId: string;
  direction: MessageDirection;
  senderType: SenderType;
  senderId?: string;
  contentType: MessageContentType;
  body?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaSize?: number;
  externalId?: string;
  status?: MessageStatus;
  errorMessage?: string;
  replyToId?: string;
  metadata?: Record<string, any>;
}

/**
 * Insere uma mensagem no banco de dados
 */
export async function createMessage(data: MessageData) {
  try {
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: data.conversationId,
        direction: data.direction,
        sender_type: data.senderType,
        sender_id: data.senderId,
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
      logger.error('Error creating message', error, {
        conversationId: data.conversationId,
        externalId: data.externalId,
      });
      throw error;
    }

    logger.debug('Message created', {
      messageId: message.id,
      conversationId: data.conversationId,
      externalId: data.externalId,
    });

    return message;
  } catch (error) {
    logger.error('Failed to create message', error);
    throw error;
  }
}

/**
 * Atualiza o status de uma mensagem pelo external_id
 */
export async function updateMessageStatus(
  externalId: string,
  status: MessageStatus,
  errorMessage?: string
) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .update({
        status,
        error_message: errorMessage,
      })
      .eq('external_id', externalId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating message status', error, {
        externalId,
        status,
      });
      throw error;
    }

    return data;
  } catch (error) {
    logger.error('Failed to update message status', error);
    throw error;
  }
}

/**
 * Busca mensagem por external_id
 */
export async function getMessageByExternalId(externalId: string) {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('external_id', externalId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      logger.error('Error fetching message', error);
      throw error;
    }

    return data || null;
  } catch (error) {
    logger.error('Failed to get message by external id', error);
    throw error;
  }
}
