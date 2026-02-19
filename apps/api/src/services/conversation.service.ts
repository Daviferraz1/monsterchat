import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import type { ConversationStatus, Priority } from '../types/common.types.js';

export interface ConversationData {
  channelId: string;
  contactId: string;
  status?: ConversationStatus;
  assignedTo?: string;
  priority?: Priority;
  subject?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * Busca ou cria uma conversa para um canal e contato
 */
export async function findOrCreateConversation(data: ConversationData) {
  try {
    // Tentar encontrar conversa existente
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('channel_id', data.channelId)
      .eq('contact_id', data.contactId)
      .eq('status', data.status || 'open')
      .maybeSingle();

    if (existing) {
      logger.debug('Found existing conversation', {
        conversationId: existing.id,
        channelId: data.channelId,
        contactId: data.contactId,
      });
      return existing;
    }

    // Criar nova conversa
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        channel_id: data.channelId,
        contact_id: data.contactId,
        status: data.status || 'open',
        assigned_to: data.assignedTo,
        priority: data.priority || 'normal',
        subject: data.subject,
        tags: data.tags || [],
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating conversation', error, {
        channelId: data.channelId,
        contactId: data.contactId,
      });
      throw error;
    }

    logger.debug('Created new conversation', {
      conversationId: conversation.id,
      channelId: data.channelId,
      contactId: data.contactId,
    });

    return conversation;
  } catch (error) {
    logger.error('Failed to find or create conversation', error);
    throw error;
  }
}

/**
 * Atualiza informações da conversa (última mensagem, preview, etc.)
 */
export async function updateConversation(
  conversationId: string,
  updates: {
    lastMessageAt?: string;
    lastMessagePreview?: string;
    unreadCount?: number;
    status?: ConversationStatus;
  }
) {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating conversation', error, {
        conversationId,
      });
      throw error;
    }

    return data;
  } catch (error) {
    logger.error('Failed to update conversation', error);
    throw error;
  }
}
