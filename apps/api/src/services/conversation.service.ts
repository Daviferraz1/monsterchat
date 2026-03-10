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
 * Busca ou cria uma conversa para um canal e contato.
 * Se existir conversa com mesmo channel+contact (qualquer status), reutiliza; senão cria com status desejado.
 */
export async function findOrCreateConversation(data: ConversationData) {
  try {
    // Tentar encontrar conversa existente (qualquer status) para evitar duplicar conversa por canal+contato
    const { data: existing } = await supabase
      .from('conversations')
      .select('*')
      .eq('channel_id', data.channelId)
      .eq('contact_id', data.contactId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
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
    const row: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.lastMessageAt !== undefined) row.last_message_at = updates.lastMessageAt;
    if (updates.lastMessagePreview !== undefined) row.last_message_preview = updates.lastMessagePreview;
    if (updates.unreadCount !== undefined) row.unread_count = updates.unreadCount;
    if (updates.status !== undefined) row.status = updates.status;

    const { data, error } = await supabase
      .from('conversations')
      .update(row)
      .eq('id', conversationId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating conversation', error, {
        conversationId,
        code: (error as { code?: string })?.code,
      });
      throw error;
    }

    return data;
  } catch (error) {
    logger.error('Failed to update conversation', error);
    throw error;
  }
}
