// Handler principal do webhook do Instagram (Messaging API)
// https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook

import { upsertContact } from '../services/contact';
import { findOrCreateConversation, updateConversation } from '../services/conversation';
import { createMessage, getMessageByExternalId } from '../services/message';
import { getInstagramChannelByRecipientId, getInstagramChannelMaybeInactiveByRecipientId } from '../services/channel';
import { storeMetaUrlMediaInSupabase } from '../services/whatsapp-media';
import { getInstagramUserProfile } from '../services/instagram';
import { extractEmailFromText } from '../utils';

interface InstagramWebhookEntry {
  id: string;
  time?: number;
  messaging?: InstagramMessaging[];
}

interface InstagramMessaging {
  sender: { id: string; username?: string };
  recipient: { id: string };
  timestamp: number;
  message?: InstagramMessage;
  message_reads?: { watermark: number }[];
  reaction?: { mid: string; action: string; reaction?: string; emoji?: string };
  postback?: { title: string; payload: string };
}

interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: { type: string; payload: { url: string; sticker_id?: number } }[];
  reply_to?: { mid: string };
  is_echo?: boolean;
}

interface UnifiedInboundMessage {
  channelType: 'instagram';
  channelId: string;
  contactExternalId: string;
  contactName?: string;
  messageExternalId: string;
  contentType: string;
  body?: string;
  mediaId?: string;
  mediaFilename?: string;
  timestamp: string;
  rawPayload: unknown;
}

export async function handleInstagramWebhook(body: unknown) {
  console.log('[Instagram Webhook] Received:', JSON.stringify(body, null, 2));

  const webhookBody = body as { entry?: InstagramWebhookEntry[] };
  if (!webhookBody.entry || webhookBody.entry.length === 0) {
    console.warn('[Instagram Webhook] Empty entry');
    return;
  }

  for (const entry of webhookBody.entry) {
    const messagingList = entry.messaging || [];
    for (const messaging of messagingList) {
      // Em mensagens normais (usuário → negócio): recipient.id = conta Instagram. Em echo (negócio → usuário): sender.id = conta Instagram.
      const isEcho = messaging.message?.is_echo === true;
      const pageId = isEcho ? messaging.sender?.id : messaging.recipient?.id;
      if (!pageId) {
        console.warn('[Instagram Webhook] Missing recipient.id or sender.id');
        continue;
      }

      let channel = await getInstagramChannelByRecipientId(pageId);
      if (!channel) {
        const inactive = await getInstagramChannelMaybeInactiveByRecipientId(pageId);
        if (inactive) {
          console.warn('[Instagram Webhook] Canal existe mas está inativo.', { pageId, channelId: inactive.id });
        } else {
          console.error('[Instagram Webhook] Canal não encontrado. Em Configurações → Canais, use External ID ou ID da conta de negócios = ' + pageId, { pageId });
        }
        continue;
      }

      console.log('[Instagram Webhook] Channel found:', { channelId: channel.id, channelName: channel.name });

      if (messaging.message && !messaging.message.is_echo) {
        try {
          await processInstagramMessage(messaging, channel.id, channel.access_token);
          console.log('[Instagram Webhook] Message processed:', messaging.message.mid);
        } catch (error) {
          console.error('[Instagram Webhook] Error processing message:', error, { mid: messaging.message.mid });
        }
      }

      if (messaging.message_reads && messaging.message_reads.length > 0) {
        for (const read of messaging.message_reads) {
          console.debug('[Instagram Webhook] Message read', { watermark: read.watermark });
        }
      }

      if (messaging.reaction) {
        try {
          await processInstagramReaction(messaging.reaction, channel.id);
        } catch (error) {
          console.error('[Instagram Webhook] Error processing reaction:', error);
        }
      }
    }
  }
}

async function processInstagramMessage(
  messaging: InstagramMessaging,
  channelId: string,
  accessToken: string
) {
  const message = messaging.message!;
  const senderId = messaging.sender.id;

  const existing = await getMessageByExternalId(message.mid);
  if (existing) {
    console.debug('[Instagram Webhook] Message already processed', { mid: message.mid });
    return;
  }

  const normalized = normalizeInstagramMessage(message, channelId, messaging.sender, messaging.timestamp);

  const profile = await getInstagramUserProfile(senderId, accessToken);
  // Nome: perfil da API > @username do payload > fallback único (evita "Contato sem nome" quando a API de perfil falha, ex. 803)
  const contactName =
    profile?.name ||
    (messaging.sender.username ? `@${messaging.sender.username}` : null) ||
    profile?.username ||
    `Instagram ${senderId.slice(-6)}`;
  const contactProfilePic = profile?.profile_pic;

  // A API do Instagram não expõe email do usuário; extrair da mensagem se o texto parecer um email
  const extractedEmail = extractEmailFromText(normalized.body);

  const contactRecord = await upsertContact({
    channelType: 'instagram',
    externalId: senderId,
    name: contactName,
    profilePicUrl: contactProfilePic,
    email: extractedEmail,
    metadata: messaging.sender.username || profile?.username ? { username: messaging.sender.username || profile?.username } : undefined,
  });

  console.log('[Instagram Webhook] Finding or creating conversation', { channelId, contactId: contactRecord.id });
  const conversation = await findOrCreateConversation({
    channelId,
    contactId: contactRecord.id,
  });
  console.log('[Instagram Webhook] Conversation ready', { conversationId: conversation.id });

  let mediaUrl: string | undefined;
  let mediaMimeType: string | undefined;

  if (message.attachments && message.attachments.length > 0) {
    const attachment = message.attachments[0];
    const contentType = (attachment.type === 'file' ? 'document' : attachment.type) as string;
    try {
      const result = await storeMetaUrlMediaInSupabase(
        attachment.payload.url,
        accessToken,
        conversation.id,
        {
          contentType,
          mimeType: attachment.type === 'image' ? 'image/jpeg' : attachment.type === 'video' ? 'video/mp4' : attachment.type === 'audio' ? 'audio/mpeg' : undefined,
        }
      );
      mediaUrl = result.url;
      mediaMimeType = result.mimeType;
    } catch (error) {
      console.error('[Instagram Webhook] Error processing attachment:', error, { type: attachment.type });
    }
  }

  await createMessage({
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
    metadata: normalized.rawPayload as Record<string, unknown>,
  });

  await updateConversation(conversation.id, {
    lastMessageAt: normalized.timestamp,
    lastMessagePreview: normalized.body || `[${normalized.contentType}]`,
    unreadCount: (conversation.unread_count || 0) + 1,
  });
}

function normalizeInstagramMessage(
  message: InstagramMessage,
  channelId: string,
  sender: { id: string; username?: string },
  timestampMs?: number
): UnifiedInboundMessage {
  let contentType = 'text';
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
      default:
        contentType = attachment.type || 'unsupported';
    }
  } else {
    contentType = 'unsupported';
    body = JSON.stringify(message);
  }

  const ts = timestampMs != null ? Number(timestampMs) : Date.now();
  const date = ts < 1e12 ? new Date(ts * 1000) : new Date(ts);

  return {
    channelType: 'instagram',
    channelId,
    contactExternalId: sender.id,
    contactName: sender.username,
    messageExternalId: message.mid,
    contentType,
    body,
    timestamp: date.toISOString(),
    rawPayload: message,
  };
}

async function processInstagramReaction(
  reaction: { mid: string; action: string; reaction?: string; emoji?: string },
  _channelId: string
) {
  const originalMessage = await getMessageByExternalId(reaction.mid);
  if (!originalMessage) {
    console.warn('[Instagram Webhook] Original message not found for reaction', { mid: reaction.mid });
    return;
  }

  const emoji = reaction.emoji ?? reaction.reaction ?? '';
  await createMessage({
    conversationId: originalMessage.conversation_id,
    direction: 'inbound',
    senderType: 'contact',
    contentType: 'reaction',
    body: emoji,
    externalId: `reaction_${reaction.mid}_${Date.now()}`,
    status: 'delivered',
    metadata: reaction,
  });
}
