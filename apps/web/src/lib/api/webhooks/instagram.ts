// Handler principal do webhook do Instagram (Messaging API)
// https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook

import { upsertContact, getContactByChannel } from '../services/contact';
import { findOrCreateConversation, updateConversation } from '../services/conversation';
import { createMessage, getMessageByExternalId } from '../services/message';
import { getInstagramChannelByRecipientId, getInstagramChannelMaybeInactiveByRecipientId } from '../services/channel';
import { storeMetaUrlMediaInSupabase, storeContactAvatarInSupabase } from '../services/whatsapp-media';
import { getInstagramUserProfile } from '../services/instagram';
import { extractEmailFromText } from '../utils';
import { supabaseAdmin } from '../supabase';

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

      if (messaging.message) {
        try {
          if (messaging.message.is_echo) {
            await processInstagramEcho(messaging, channel.id, channel.access_token);
          } else {
            await processInstagramMessage(messaging, channel.id, channel.access_token, channel.external_id);
          }
          console.log('[Instagram Webhook] Message processed:', messaging.message.mid, { isEcho });
        } catch (error) {
          console.error('[Instagram Webhook] Error processing message:', error, { mid: messaging.message.mid, isEcho });
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
  accessToken: string,
  /** Page ID: com token do Facebook, o perfil do usuário só resolve com Page Access Token. */
  pageId?: string | null
) {
  const message = messaging.message!;
  const senderId = messaging.sender.id;

  const existing = await getMessageByExternalId(message.mid);
  if (existing) {
    console.debug('[Instagram Webhook] Message already processed', { mid: message.mid });
    return;
  }

  const normalized = normalizeInstagramMessage(message, channelId, messaging.sender, messaging.timestamp);

  const profile = await getInstagramUserProfile(senderId, accessToken, pageId ?? undefined);
  // Nome: perfil da API > @username do payload > fallback único (evita "Contato sem nome" quando a API de perfil falha, ex. 803)
  const realName = profile?.name || (messaging.sender.username ? `@${messaging.sender.username}` : null) || profile?.username;
  const contactName = realName || `Instagram ${senderId.slice(-6)}`;

  // A URL de perfil da Meta expira; espelhar no Supabase para o avatar não sumir depois.
  const existingContact = await getContactByChannel('instagram', senderId);
  const contactProfilePic = profile?.profile_pic
    ? await storeContactAvatarInSupabase(profile.profile_pic, 'instagram', senderId, existingContact)
    : undefined;

  // A API do Instagram não expõe email do usuário; extrair da mensagem se o texto parecer um email
  const extractedEmail = extractEmailFromText(normalized.body);

  const contactRecord = await upsertContact({
    channelType: 'instagram',
    externalId: senderId,
    name: contactName,
    nameIsFallback: !realName,
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

/**
 * Mensagem enviada pela empresa (echo) — inclusive as respondidas direto pelo app do
 * Instagram no celular. Sem isso, quem respondia pelo celular não deixava rastro na inbox:
 * o histórico ficava com buraco e a IA seguia achando que ninguém tinha respondido.
 *
 * A Meta dispara echo também para o que o próprio MonsterChat envia, então deduplicar é
 * obrigatório — sem isso toda mensagem enviada apareceria duas vezes na conversa.
 */
async function processInstagramEcho(
  messaging: InstagramMessaging,
  channelId: string,
  accessToken: string
) {
  const message = messaging.message!;
  // No echo os papéis se invertem: quem envia é a empresa, o cliente é o destinatário.
  const customerId = messaging.recipient?.id;
  if (!customerId) {
    console.warn('[Instagram Echo] Sem recipient.id — não dá para saber de qual conversa é.');
    return;
  }

  // 1ª barreira: mesmo mid já gravado. Pega o caso normal, já que o envio guarda o
  // message_id devolvido pela API e a Meta reusa esse id no echo.
  if (await getMessageByExternalId(message.mid)) {
    console.debug('[Instagram Echo] Já gravada (mesmo mid):', message.mid);
    return;
  }

  const contact = await getContactByChannel('instagram', customerId);
  if (!contact) {
    // O Instagram só deixa a empresa escrever para quem escreveu antes, então o contato
    // deveria existir. Se não existe, não há conversa para pendurar a mensagem.
    console.warn('[Instagram Echo] Contato desconhecido, echo ignorado.', { customerId });
    return;
  }

  const conversation = await findOrCreateConversation({ channelId, contactId: contact.id });
  const normalized = normalizeInstagramMessage(message, channelId, messaging.sender, messaging.timestamp);

  // 2ª barreira: se a Meta usar um mid diferente do message_id do envio, o de-dup acima não
  // pega e a mensagem duplicaria. Aqui olhamos se já existe saída igual nos últimos 2 minutos.
  if (await hasRecentOutboundDuplicate(conversation.id, normalized.body, normalized.contentType)) {
    console.debug('[Instagram Echo] Já gravada (saída idêntica recente), ignorando duplicata.');
    return;
  }

  let mediaUrl: string | undefined;
  let mediaMimeType: string | undefined;
  if (message.attachments && message.attachments.length > 0) {
    const attachment = message.attachments[0];
    try {
      const result = await storeMetaUrlMediaInSupabase(
        attachment.payload.url,
        accessToken,
        conversation.id,
        {
          contentType: normalized.contentType,
          mimeType:
            attachment.type === 'image' ? 'image/jpeg'
            : attachment.type === 'video' ? 'video/mp4'
            : attachment.type === 'audio' ? 'audio/mpeg'
            : undefined,
        }
      );
      mediaUrl = result.url;
      mediaMimeType = result.mimeType;
    } catch (error) {
      console.error('[Instagram Echo] Erro ao salvar anexo:', error);
    }
  }

  await createMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    // Foi uma pessoa que respondeu, só que fora do MonsterChat: fica sem agent_user_id.
    senderType: 'agent',
    contentType: normalized.contentType,
    body: normalized.body,
    mediaUrl,
    mediaMimeType,
    externalId: message.mid,
    status: 'sent',
    metadata: { ...(normalized.rawPayload as object), via: 'instagram_app' },
  });

  await updateConversation(conversation.id, {
    lastMessageAt: normalized.timestamp,
    lastMessagePreview: normalized.body || `[${normalized.contentType}]`,
    lastAgentReplyAt: new Date().toISOString(),
  });

  console.log('[Instagram Echo] Resposta enviada fora do MonsterChat registrada.', {
    conversationId: conversation.id,
    mid: message.mid,
  });
}

/** Saída idêntica gravada há menos de 2 minutos — provável echo do que nós mesmos enviamos. */
async function hasRecentOutboundDuplicate(
  conversationId: string,
  body: string | undefined,
  contentType: string
): Promise<boolean> {
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  let query = supabaseAdmin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('content_type', contentType)
    .gte('created_at', since)
    .limit(1);
  query = body ? query.eq('body', body) : query.is('body', null);
  const { data } = await query;
  return Array.isArray(data) && data.length > 0;
}

/**
 * O que o atendente lê no lugar de um anexo que a Meta não entrega pela API.
 *
 * Foto tirada pela câmera dentro da conversa vai como "visualização única" por padrão, e a
 * documentação da Meta é explícita: mídia temporária não é entregue no webhook (vem como
 * `ephemeral`, sem URL). Sem este aviso o atendente não fica sabendo que o cliente mandou algo.
 * https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/
 */
function descreverAnexoNaoSuportado(type?: string): string {
  if (type === 'ephemeral') {
    return '📸 Foto ou vídeo de visualização única. O Instagram não entrega esse conteúdo pela API — abra a conversa no app para ver.';
  }
  return `📎 Anexo que o Instagram não entrega pela API${type ? ` (${type})` : ''}. Abra a conversa no app para ver.`;
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
        // 'ephemeral' (foto/vídeo de visualização única), 'share', 'ig_reel' e afins não
        // existem no CHECK da tabela: o insert era rejeitado e a mensagem sumia. Vira texto
        // avisando o atendente — o payload cru fica no metadata.
        contentType = 'text';
        body = descreverAnexoNaoSuportado(attachment.type);
    }
  } else {
    contentType = 'text';
    body = descreverAnexoNaoSuportado();
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
