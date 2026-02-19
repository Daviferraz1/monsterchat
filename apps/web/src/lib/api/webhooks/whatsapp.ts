// Handler principal do webhook do WhatsApp
// Implementação completa conforme documentação oficial da Meta
// https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/

import { upsertContact } from '../services/contact';
import { findOrCreateConversation, updateConversation } from '../services/conversation';
import { createMessage, updateMessageStatus, getMessageByExternalId } from '../services/message';
import { getChannelByExternalId } from '../services/channel';
import { downloadWhatsAppMedia } from '../services/whatsapp-media';

interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: {
          name: string;
        };
        wa_id: string;
      }>;
      messages?: Array<any>;
      statuses?: Array<any>;
    };
    field: string;
  }>;
}

interface UnifiedInboundMessage {
  channelType: 'whatsapp';
  channelId: string;
  contactExternalId: string;
  contactName?: string;
  messageExternalId: string;
  contentType: string;
  body?: string;
  mediaId?: string;
  timestamp: string;
  rawPayload: any;
}

export async function handleWhatsAppWebhook(body: any) {
  console.log('WhatsApp webhook received:', JSON.stringify(body, null, 2));

  try {
    const webhookBody = body as { entry?: WhatsAppWebhookEntry[] };

    if (!webhookBody.entry || webhookBody.entry.length === 0) {
      console.warn('Empty WhatsApp webhook entry');
      return;
    }

    for (const entry of webhookBody.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        const phoneNumberId = value.metadata.phone_number_id;

        // Buscar canal
        const channel = await getChannelByExternalId('whatsapp', phoneNumberId);
        if (!channel) {
          console.warn('Channel not found for WhatsApp webhook', {
            phoneNumberId,
          });
          continue;
        }

        // Processar mensagens recebidas
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            await processWhatsAppMessage(message, value, channel.id, channel.access_token);
          }
        }

        // Processar status de mensagens
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            await processWhatsAppStatus(status);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    throw error;
  }
}

/**
 * Processa uma mensagem recebida do WhatsApp
 */
async function processWhatsAppMessage(
  message: any,
  webhookValue: any,
  channelId: string,
  accessToken: string
) {
  try {
    // Verificar se mensagem já foi processada (idempotência)
    const existing = await getMessageByExternalId(message.id);
    if (existing) {
      console.debug('WhatsApp message already processed', {
        messageId: message.id,
      });
      return;
    }

    const from = message.from;
    const contact = webhookValue.contacts?.find((c: any) => c.wa_id === from);

    // Normalizar mensagem
    const normalized = normalizeWhatsAppMessage(message, channelId, contact);

    // Upsert contato
    const contactRecord = await upsertContact({
      channelType: 'whatsapp',
      externalId: from,
      name: contact?.profile?.name,
      phone: from,
    });

    // Buscar ou criar conversa
    const conversation = await findOrCreateConversation({
      channelId,
      contactId: contactRecord.id,
    });

    // Processar mídia se houver
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;
    let mediaFilename: string | undefined;
    let mediaSize: number | undefined;

    if (normalized.mediaId) {
      try {
        const mediaInfo = await downloadWhatsAppMedia(normalized.mediaId, accessToken);
        // Nota: Para produção, você precisaria fazer upload da mídia para Supabase Storage
        // Por enquanto, apenas armazenamos a URL temporária da Meta
        mediaUrl = mediaInfo.url;
        mediaMimeType = mediaInfo.mimeType;
      } catch (error) {
        console.error('Error processing WhatsApp media', error, {
          mediaId: normalized.mediaId,
        });
      }
    }

    // Criar mensagem
    const messageRecord = await createMessage({
      conversationId: conversation.id,
      direction: 'inbound',
      senderType: 'contact',
      senderId: from,
      contentType: normalized.contentType,
      body: normalized.body,
      mediaUrl,
      mediaMimeType,
      mediaFilename,
      mediaSize,
      externalId: normalized.messageExternalId,
      status: 'delivered',
      metadata: normalized.rawPayload,
    });

    // Atualizar conversa
    await updateConversation(conversation.id, {
      lastMessageAt: normalized.timestamp,
      lastMessagePreview: normalized.body || `[${normalized.contentType}]`,
      unreadCount: (conversation.unread_count || 0) + 1,
    });

    console.log('WhatsApp message processed', {
      messageId: messageRecord.id,
      conversationId: conversation.id,
      externalId: normalized.messageExternalId,
    });
  } catch (error) {
    console.error('Error processing WhatsApp message', error, {
      messageId: message.id,
    });
    throw error;
  }
}

/**
 * Normaliza mensagem do WhatsApp para formato unificado
 */
function normalizeWhatsAppMessage(
  message: any,
  channelId: string,
  contact?: any
): UnifiedInboundMessage {
  let contentType: string = 'text';
  let body: string | undefined;
  let mediaId: string | undefined;

  if (message.text) {
    contentType = 'text';
    body = message.text.body;
  } else if (message.image) {
    contentType = 'image';
    mediaId = message.image.id;
    body = message.image.caption;
  } else if (message.video) {
    contentType = 'video';
    mediaId = message.video.id;
    body = message.video.caption;
  } else if (message.audio) {
    contentType = 'audio';
    mediaId = message.audio.id;
  } else if (message.document) {
    contentType = 'document';
    mediaId = message.document.id;
    body = message.document.caption;
    // Filename pode estar em message.document.filename
  } else if (message.sticker) {
    contentType = 'sticker';
    mediaId = message.sticker.id;
  } else if (message.location) {
    contentType = 'location';
    body = JSON.stringify(message.location);
  } else if (message.reaction) {
    contentType = 'reaction';
    body = message.reaction.emoji;
  } else {
    contentType = 'unsupported';
    body = JSON.stringify(message);
  }

  return {
    channelType: 'whatsapp',
    channelId,
    contactExternalId: message.from,
    contactName: contact?.profile?.name,
    messageExternalId: message.id,
    contentType,
    body,
    mediaId,
    timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    rawPayload: message,
  };
}

/**
 * Processa status de mensagem do WhatsApp (sent, delivered, read)
 */
async function processWhatsAppStatus(status: any) {
  try {
    const statusMap: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = {
      sent: 'sent',
      delivered: 'delivered',
      read: 'read',
      failed: 'failed',
    };

    const newStatus = statusMap[status.status];
    if (!newStatus) {
      return;
    }

    await updateMessageStatus(
      status.id,
      newStatus,
      status.errors?.[0]?.message
    );

    console.debug('WhatsApp message status updated', {
      externalId: status.id,
      status: newStatus,
    });
  } catch (error) {
    console.error('Error processing WhatsApp status', error, {
      statusId: status.id,
    });
  }
}
