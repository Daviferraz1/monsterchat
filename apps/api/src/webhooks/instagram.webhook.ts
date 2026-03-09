import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import type { InstagramWebhookEntry } from '../types/instagram.types.js';
import { upsertContact } from '../services/contact.service.js';
import { findOrCreateConversation, updateConversation } from '../services/conversation.service.js';
import { createMessage, getMessageByExternalId } from '../services/message.service.js';
import { getChannelByExternalId } from '../services/channel.service.js';
import { downloadAndUploadMedia } from '../services/media.service.js';
import type { UnifiedInboundMessage } from '../types/common.types.js';

/**
 * Processa webhook do Instagram
 * Retorna 200 imediatamente e processa assincronamente
 */
export async function handleInstagramWebhook(req: Request, res: Response) {
  // Responder imediatamente
  res.status(200).send('OK');

  try {
    const body = req.body as { entry?: InstagramWebhookEntry[] };

    if (!body.entry || body.entry.length === 0) {
      logger.warn('Empty Instagram webhook entry');
      return;
    }

    for (const entry of body.entry) {
      for (const messaging of entry.messaging) {
        const pageId = messaging.recipient.id;

        // Buscar canal
        const channel = await getChannelByExternalId('instagram', pageId);
        if (!channel) {
          logger.warn('Channel not found for Instagram webhook', {
            pageId,
          });
          continue;
        }

        // Processar mensagem
        if (messaging.message && !messaging.message.is_echo) {
          await processInstagramMessage(messaging, channel.id);
        }

        // Processar leituras
        if (messaging.message_reads) {
          await processInstagramReads(messaging.message_reads);
        }

        // Processar reações
        if (messaging.reaction) {
          await processInstagramReaction(messaging.reaction, channel.id);
        }
      }
    }
  } catch (error) {
    logger.error('Error processing Instagram webhook', error);
  }
}

/**
 * Processa uma mensagem recebida do Instagram
 */
async function processInstagramMessage(
  messaging: any,
  channelId: string
) {
  try {
    const message = messaging.message;
    const senderId = messaging.sender.id;

    // Verificar se mensagem já foi processada (idempotência)
    const existing = await getMessageByExternalId(message.mid);
    if (existing) {
      logger.debug('Instagram message already processed', {
        messageId: message.mid,
      });
      return;
    }

    // Normalizar mensagem
    const normalized = normalizeInstagramMessage(message, channelId, senderId);

    // Upsert contato
    const contactRecord = await upsertContact({
      channelType: 'instagram',
      externalId: senderId,
      metadata: {
        username: messaging.sender.username,
      },
    });

    // Buscar ou criar conversa
    const conversation = await findOrCreateConversation({
      channelId,
      contactId: contactRecord.id,
    });

    // Processar anexos se houver
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;

    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];
      try {
        const mediaPath = `instagram/${normalized.messageExternalId}/${attachment.payload.sticker_id || 'media'}`;
        const uploaded = await downloadAndUploadMedia(
          attachment.payload.url,
          'media',
          mediaPath,
          attachment.type
        );
        mediaUrl = uploaded.url;
        mediaMimeType = attachment.type;
      } catch (error) {
        logger.error('Error processing Instagram attachment', error, {
          attachmentType: attachment.type,
        });
      }
    }

    // Criar mensagem
    const messageRecord = await createMessage({
      conversationId: conversation.id,
      direction: 'inbound',
      senderType: 'contact',
      senderId: senderId,
      contentType: normalized.contentType,
      body: normalized.body,
      mediaUrl,
      mediaMimeType,
      externalId: normalized.messageExternalId,
      status: 'delivered',
      metadata: normalized.rawPayload,
    });

    // Atualizar conversa
    await updateConversation(conversation.id, {
      lastMessageAt: normalized.timestamp,
      lastMessagePreview: normalized.body || `[${normalized.contentType}]`,
      unreadCount: conversation.unread_count + 1,
    });

    logger.info('Instagram message processed', {
      messageId: messageRecord.id,
      conversationId: conversation.id,
      externalId: normalized.messageExternalId,
    });
  } catch (error) {
    logger.error('Error processing Instagram message', error, {
      messageId: messaging.message?.mid,
    });
  }
}

/**
 * Normaliza mensagem do Instagram para formato unificado
 */
function normalizeInstagramMessage(
  message: any,
  channelId: string,
  senderId: string
): UnifiedInboundMessage {
  let contentType: UnifiedInboundMessage['contentType'] = 'text';
  let body: string | undefined;

  if (message.text) {
    contentType = 'text';
    body = message.text;
  } else if (message.attachments && message.attachments.length > 0) {
    const attachment = message.attachments[0];
    switch (attachment.type) {
      case 'image':
        contentType = 'image';
        break;
      case 'video':
        contentType = 'video';
        break;
      case 'audio':
        contentType = 'audio';
        break;
      case 'file':
        contentType = 'document';
        break;
    }
  }

  return {
    channelType: 'instagram',
    channelId,
    contactExternalId: senderId,
    messageExternalId: message.mid,
    contentType,
    body,
    timestamp: new Date(message.timestamp).toISOString(),
    rawPayload: message,
  };
}

/**
 * Processa leituras de mensagem do Instagram
 */
async function processInstagramReads(messageReads: any[]) {
  try {
    for (const read of messageReads) {
      // Instagram não envia IDs específicos de mensagens lidas,
      // apenas um watermark. Aqui você pode atualizar todas as mensagens
      // anteriores a esse timestamp como "read"
      logger.debug('Instagram message read', {
        watermark: read.watermark,
      });
      // Implementar lógica de atualização em lote se necessário
    }
  } catch (error) {
    logger.error('Error processing Instagram reads', error);
  }
}

/**
 * Processa reação do Instagram
 */
async function processInstagramReaction(reaction: any, _channelId: string) {
  try {
    // Buscar mensagem original
    const originalMessage = await getMessageByExternalId(reaction.mid);
    if (!originalMessage) {
      logger.warn('Original message not found for reaction', {
        messageId: reaction.mid,
      });
      return;
    }

    // Criar mensagem de reação
    await createMessage({
      conversationId: originalMessage.conversation_id,
      direction: 'inbound',
      senderType: 'contact',
      contentType: 'reaction',
      body: reaction.emoji,
      externalId: `reaction_${reaction.mid}_${Date.now()}`,
      status: 'delivered',
      metadata: reaction,
    });

    logger.debug('Instagram reaction processed', {
      messageId: reaction.mid,
      emoji: reaction.emoji,
    });
  } catch (error) {
    logger.error('Error processing Instagram reaction', error);
  }
}
