// Handler do webhook do Facebook Messenger (mensagens da Página) — eventos com `object: "page"`.
// Mesmo formato do Instagram (entry[].messaging[]), com PSID no lugar do IGSID.
// https://developers.facebook.com/docs/messenger-platform/webhooks

import { upsertContact, getContactByChannel } from '../services/contact';
import { findOrCreateConversation, updateConversation } from '../services/conversation';
import { createMessage, getMessageByExternalId } from '../services/message';
import { getChannelByExternalId, getChannelByExternalIdMaybeInactive } from '../services/channel';
import { storeMetaUrlMediaInSupabase, storeContactAvatarInSupabase } from '../services/whatsapp-media';
import { getMessengerUserProfile } from '../services/messenger';
import { extractEmailFromText } from '../utils';
import { supabaseAdmin } from '../supabase';
import { hasRecentOutboundDuplicate } from './instagram';
import { ehAusenciaInstagram, VIA_AUSENCIA } from '@/lib/ausencia-instagram';

interface MessengerWebhookEntry {
  /** ID da Página. */
  id: string;
  time?: number;
  messaging?: MessengerMessaging[];
  /**
   * Mesmos eventos de `messaging`, entregues aqui quando outro app é o "receptor principal"
   * da conversa (protocolo de transferência da Meta). Sem ler este campo a mensagem não
   * apareceria no inbox.
   */
  standby?: MessengerMessaging[];
}

interface MessengerMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: MessengerMessage;
  reaction?: { mid: string; action: string; reaction?: string; emoji?: string };
  /** Entrada por anúncio ou link m.me (evento messaging_referrals ou junto da mensagem). */
  referral?: MessengerReferral;
}

interface MessengerReferral {
  ref?: string;
  source?: string;
  type?: string;
  ad_id?: string;
  ads_context_data?: { ad_title?: string; photo_url?: string; video_url?: string };
}

interface MessengerAttachment {
  type: string;
  payload?: { url?: string; sticker_id?: number; title?: string; coordinates?: { lat: number; long: number } };
  title?: string;
  url?: string;
}

interface MessengerMessage {
  mid: string;
  text?: string;
  attachments?: MessengerAttachment[];
  reply_to?: { mid: string };
  is_echo?: boolean;
  app_id?: number;
  referral?: MessengerReferral;
}

interface MensagemNormalizada {
  contentType: string;
  body?: string;
  /** URL do anexo a espelhar no Supabase, quando há. */
  anexoUrl?: string;
  mimeType?: string;
  timestamp: string;
}

export async function handleMessengerWebhook(body: unknown) {
  console.log('[Messenger Webhook] Received:', JSON.stringify(body, null, 2));

  const webhookBody = body as { entry?: MessengerWebhookEntry[] };
  if (!webhookBody.entry || webhookBody.entry.length === 0) {
    console.warn('[Messenger Webhook] Empty entry');
    return;
  }

  for (const entry of webhookBody.entry) {
    for (const messaging of [...(entry.messaging || []), ...(entry.standby || [])]) {
      // Mensagem normal (usuário → Página): recipient.id = Página. Echo (Página → usuário): sender.id = Página.
      const isEcho = messaging.message?.is_echo === true;
      const pageId = (isEcho ? messaging.sender?.id : messaging.recipient?.id) || entry.id;
      if (!pageId) {
        console.warn('[Messenger Webhook] Missing page id');
        continue;
      }

      const channel = await getChannelByExternalId('facebook', pageId);
      if (!channel) {
        const inactive = await getChannelByExternalIdMaybeInactive('facebook', pageId);
        if (inactive) {
          console.warn('[Messenger Webhook] Canal existe mas está inativo.', { pageId, channelId: inactive.id });
        } else {
          console.error('[Messenger Webhook] Canal não encontrado. Em Configurações → Canais, cadastre um canal Facebook Messenger com o ID da Página = ' + pageId, { pageId });
        }
        continue;
      }

      if (messaging.message) {
        try {
          if (isEcho) {
            await processMessengerEcho(messaging, channel.id, channel.access_token);
          } else {
            await processMessengerMessage(messaging, channel.id, channel.access_token, pageId);
          }
          console.log('[Messenger Webhook] Message processed:', messaging.message.mid, { isEcho });
        } catch (error) {
          console.error('[Messenger Webhook] Error processing message:', error, { mid: messaging.message.mid, isEcho });
        }
      }

      // Entrada por anúncio/link sem mensagem junto: grava a origem já no contato.
      if (messaging.referral && !messaging.message) {
        try {
          await registrarOrigemMessenger(messaging.sender.id, messaging.referral);
        } catch (error) {
          console.error('[Messenger Webhook] Error processing referral:', error);
        }
      }

      if (messaging.reaction) {
        try {
          await processMessengerReaction(messaging.reaction);
        } catch (error) {
          console.error('[Messenger Webhook] Error processing reaction:', error);
        }
      }
    }
  }
}

/**
 * Guarda de onde o lead chegou no Messenger (anúncio ou link m.me) — só o primeiro toque:
 * contato que já tem origem não é sobrescrito.
 */
async function registrarOrigemMessenger(
  senderId: string,
  referral: MessengerReferral,
  contato?: { id: string; metadata?: unknown } | null
) {
  let alvo = contato ?? null;
  if (!alvo) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('id, metadata')
      .eq('channel_type', 'facebook')
      .eq('external_id', senderId)
      .maybeSingle();
    alvo = data;
  }
  const doAnuncio = (referral.source || '').toUpperCase() === 'ADS' || Boolean(referral.ad_id);
  const campaign = {
    utm_source: doAnuncio ? 'meta' : 'facebook',
    utm_medium: doAnuncio ? 'ctm' : (referral.source || 'link').toLowerCase(),
    utm_campaign: referral.ads_context_data?.ad_title || referral.ref || undefined,
    utm_content: referral.ad_id || referral.ref || undefined,
    ad_id: referral.ad_id,
    ref: referral.ref,
    attributed_at: new Date().toISOString(),
  };
  if (!alvo) {
    await upsertContact({
      channelType: 'facebook',
      externalId: senderId,
      name: `Facebook ${senderId.slice(-6)}`,
      nameIsFallback: true,
      campaign,
    });
    return;
  }
  const metadata = ((alvo.metadata as Record<string, unknown>) || {});
  if (metadata.campaign) return;
  await supabaseAdmin
    .from('contacts')
    .update({ metadata: { ...metadata, campaign }, updated_at: new Date().toISOString() })
    .eq('id', alvo.id);
}

async function processMessengerMessage(
  messaging: MessengerMessaging,
  channelId: string,
  accessToken: string,
  pageId: string
) {
  const message = messaging.message!;
  const senderId = messaging.sender.id;

  if (await getMessageByExternalId(message.mid)) {
    console.debug('[Messenger Webhook] Message already processed', { mid: message.mid });
    return;
  }

  const normalized = normalizeMessengerMessage(message, messaging.timestamp);

  const profile = await getMessengerUserProfile(senderId, accessToken, pageId);
  const contactName = profile?.name || `Facebook ${senderId.slice(-6)}`;

  // A URL de perfil da Meta expira; espelhar no Supabase para o avatar não sumir depois.
  const existingContact = await getContactByChannel('facebook', senderId);
  const contactProfilePic = profile?.profile_pic
    ? await storeContactAvatarInSupabase(profile.profile_pic, 'facebook', senderId, existingContact)
    : undefined;

  const contactRecord = await upsertContact({
    channelType: 'facebook',
    externalId: senderId,
    name: contactName,
    nameIsFallback: !profile?.name,
    profilePicUrl: contactProfilePic,
    // A API não expõe o e-mail; aproveita se o próprio texto for um.
    email: extractEmailFromText(normalized.body),
  });

  const referral = messaging.referral ?? message.referral;
  if (referral) {
    await registrarOrigemMessenger(senderId, referral, contactRecord);
  }

  const conversation = await findOrCreateConversation({ channelId, contactId: contactRecord.id });
  const media = await espelharAnexo(normalized, accessToken, conversation.id);

  await createMessage({
    conversationId: conversation.id,
    direction: 'inbound',
    senderType: 'contact',
    senderId,
    contentType: normalized.contentType,
    body: normalized.body,
    mediaUrl: media?.url,
    mediaMimeType: media?.mimeType,
    externalId: message.mid,
    status: 'delivered',
    metadata: message as unknown as Record<string, unknown>,
  });

  await updateConversation(conversation.id, {
    lastMessageAt: normalized.timestamp,
    lastMessagePreview: normalized.body || `[${normalized.contentType}]`,
    unreadCount: (conversation.unread_count || 0) + 1,
  });
}

/**
 * Mensagem enviada pela Página (echo) — inclusive as respondidas pelo Meta Business Suite ou
 * pelo app do Facebook. A Meta manda echo também do que o próprio MonsterChat envia, então
 * deduplicar é obrigatório (mesmas duas barreiras do Instagram).
 */
async function processMessengerEcho(
  messaging: MessengerMessaging,
  channelId: string,
  accessToken: string
) {
  const message = messaging.message!;
  // No echo os papéis se invertem: quem envia é a Página, o cliente é o destinatário.
  const customerId = messaging.recipient?.id;
  if (!customerId) {
    console.warn('[Messenger Echo] Sem recipient.id — não dá para saber de qual conversa é.');
    return;
  }

  // 1ª barreira: mesmo mid já gravado (o envio guarda o message_id e a Meta reusa no echo).
  if (await getMessageByExternalId(message.mid)) {
    console.debug('[Messenger Echo] Já gravada (mesmo mid):', message.mid);
    return;
  }

  const contact = await getContactByChannel('facebook', customerId);
  if (!contact) {
    // A Página só escreve para quem escreveu antes; sem contato não há conversa para pendurar.
    console.warn('[Messenger Echo] Contato desconhecido, echo ignorado.', { customerId });
    return;
  }

  const conversation = await findOrCreateConversation({ channelId, contactId: contact.id });
  const normalized = normalizeMessengerMessage(message, messaging.timestamp);

  // 2ª barreira: saída idêntica gravada há menos de 2 minutos.
  if (await hasRecentOutboundDuplicate(conversation.id, normalized.body, normalized.contentType)) {
    console.debug('[Messenger Echo] Já gravada (saída idêntica recente), ignorando duplicata.');
    return;
  }

  // Mensagem de ausência do Meta Business Suite (mesmo texto do Instagram): fica no histórico
  // como automática, com a mesma marca, e não mexe na conversa — não é resposta de atendente.
  if (ehAusenciaInstagram(normalized.body)) {
    await createMessage({
      conversationId: conversation.id,
      direction: 'outbound',
      senderType: 'bot',
      contentType: 'text',
      body: normalized.body,
      externalId: message.mid,
      status: 'sent',
      metadata: { ...message, via: VIA_AUSENCIA },
    });
    return;
  }

  const media = await espelharAnexo(normalized, accessToken, conversation.id);

  await createMessage({
    conversationId: conversation.id,
    direction: 'outbound',
    // Foi uma pessoa que respondeu, só que fora do MonsterChat: fica sem agent_user_id.
    senderType: 'agent',
    contentType: normalized.contentType,
    body: normalized.body,
    mediaUrl: media?.url,
    mediaMimeType: media?.mimeType,
    externalId: message.mid,
    status: 'sent',
    metadata: { ...message, via: 'facebook_app' },
  });

  await updateConversation(conversation.id, {
    lastMessageAt: normalized.timestamp,
    lastMessagePreview: normalized.body || `[${normalized.contentType}]`,
    lastAgentReplyAt: new Date().toISOString(),
  });

  console.log('[Messenger Echo] Resposta enviada fora do MonsterChat registrada.', {
    conversationId: conversation.id,
    mid: message.mid,
  });
}

async function espelharAnexo(normalized: MensagemNormalizada, accessToken: string, conversationId: string) {
  if (!normalized.anexoUrl) return null;
  try {
    return await storeMetaUrlMediaInSupabase(normalized.anexoUrl, accessToken, conversationId, {
      contentType: normalized.contentType,
      mimeType: normalized.mimeType,
    });
  } catch (error) {
    console.error('[Messenger Webhook] Error processing attachment:', error, { contentType: normalized.contentType });
    return null;
  }
}

function normalizeMessengerMessage(message: MessengerMessage, timestampMs?: number): MensagemNormalizada {
  let contentType = 'text';
  let body: string | undefined = message.text || undefined;
  let anexoUrl: string | undefined;
  let mimeType: string | undefined;

  const attachment = message.attachments?.[0];
  if (!body && attachment) {
    const url = attachment.payload?.url;
    if (attachment.type === 'image' && url) {
      contentType = 'image';
      mimeType = 'image/jpeg';
      anexoUrl = url;
    } else if (attachment.type === 'video' && url) {
      contentType = 'video';
      mimeType = 'video/mp4';
      anexoUrl = url;
    } else if (attachment.type === 'audio' && url) {
      contentType = 'audio';
      mimeType = 'audio/mpeg';
      anexoUrl = url;
    } else if (attachment.type === 'file' && url) {
      contentType = 'document';
      anexoUrl = url;
    } else if (attachment.type === 'location' && attachment.payload?.coordinates) {
      const { lat, long } = attachment.payload.coordinates;
      body = `📍 Localização: https://maps.google.com/?q=${lat},${long}`;
    } else if (attachment.type === 'fallback') {
      // Link compartilhado: vem com título e URL, sem arquivo.
      const link = attachment.url || url;
      body = [attachment.title || attachment.payload?.title, link].filter(Boolean).join('\n') || descreverAnexoNaoSuportado(attachment.type);
    } else {
      // 'template', 'reel' e afins não existem no CHECK da tabela: vira texto avisando o
      // atendente, e o payload cru fica no metadata.
      body = descreverAnexoNaoSuportado(attachment.type);
    }
  } else if (!body) {
    body = descreverAnexoNaoSuportado();
  }

  const ts = timestampMs != null ? Number(timestampMs) : Date.now();
  const date = ts < 1e12 ? new Date(ts * 1000) : new Date(ts);

  return { contentType, body, anexoUrl, mimeType, timestamp: date.toISOString() };
}

/** Começa com 📎 como o aviso do Instagram: é por esse prefixo que o piloto reconhece o aviso. */
function descreverAnexoNaoSuportado(type?: string): string {
  return `📎 Anexo que o Messenger não entrega pela API${type ? ` (${type})` : ''}. Abra a conversa no Meta Business Suite para ver.`;
}

async function processMessengerReaction(reaction: { mid: string; action: string; reaction?: string; emoji?: string }) {
  const originalMessage = await getMessageByExternalId(reaction.mid);
  if (!originalMessage) {
    console.warn('[Messenger Webhook] Original message not found for reaction', { mid: reaction.mid });
    return;
  }

  // "unreact" vem sem emoji: grava vazio, como o Instagram, para o chat tirar a reação.
  const emoji = reaction.action === 'unreact' ? '' : reaction.emoji ?? reaction.reaction ?? '';
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
