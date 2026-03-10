// Handler principal do webhook do WhatsApp
// Implementação completa conforme documentação oficial da Meta
// https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/

import { upsertContact } from '../services/contact';
import { extractEmailFromText } from '../utils';
import { findOrCreateConversation, updateConversation } from '../services/conversation';
import { createMessage, updateMessageStatus, getMessageByExternalId } from '../services/message';
import { getChannelByExternalId, getChannelByExternalIdMaybeInactive } from '../services/channel';
import { storeWhatsAppMediaInSupabase } from '../services/whatsapp-media';
import { getRecentLeadTrackingByPhone, getLeadTrackingByRefFromMessage, markLeadTrackingRefUsed } from '../services/lead-tracking';
import { supabaseAdmin } from '../supabase';
import { normalizePhoneCanonical } from '../utils';

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up/i.test(msg);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; isRetryable: (err: unknown) => boolean }
): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= opts.retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < opts.retries && opts.isRetryable(e)) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw last;
}

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
  mediaFilename?: string;
  timestamp: string;
  rawPayload: any;
}

export async function handleWhatsAppWebhook(body: any) {
  console.log('[WhatsApp Webhook] Received:', JSON.stringify(body, null, 2));

  try {
    const webhookBody = body as { entry?: WhatsAppWebhookEntry[] };

    if (!webhookBody.entry || webhookBody.entry.length === 0) {
      console.warn('[WhatsApp Webhook] Empty entry');
      return;
    }

    for (const entry of webhookBody.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhoneNumber = value.metadata?.display_phone_number;

        console.log('[WhatsApp Webhook] Processing change:', {
          phoneNumberId,
          displayPhoneNumber,
          hasMessages: !!(value.messages && value.messages.length > 0),
          hasStatuses: !!(value.statuses && value.statuses.length > 0),
          messageCount: value.messages?.length || 0,
        });

        if (!phoneNumberId) {
          console.warn('[WhatsApp Webhook] Missing phone_number_id in metadata');
          continue;
        }

        // Buscar canal ativo: primeiro por Phone Number ID, depois por número de exibição (fallback)
        let channel = await getChannelByExternalId('whatsapp', phoneNumberId);
        if (!channel && displayPhoneNumber) {
          channel = await getChannelByExternalId('whatsapp', displayPhoneNumber);
          if (channel) {
            console.warn('[WhatsApp Webhook] Canal encontrado pelo número de exibição. Para evitar problemas, atualize o canal em Configurações → Canais e defina external_id = Phone Number ID = ' + phoneNumberId, {
              displayPhoneNumber,
              phoneNumberId,
              channelId: channel.id,
            });
          }
        }
        if (!channel) {
          const inactive = await getChannelByExternalIdMaybeInactive('whatsapp', phoneNumberId)
            || (displayPhoneNumber ? await getChannelByExternalIdMaybeInactive('whatsapp', displayPhoneNumber) : null);
          if (inactive) {
            console.warn('[WhatsApp Webhook] Canal existe mas está inativo. Ative em Configurações → Canais.', {
              phoneNumberId,
              displayPhoneNumber,
              channelId: inactive.id,
            });
          } else {
            console.error('[WhatsApp Webhook] Canal não encontrado — conversa não será salva. Cadastre em Configurações → Canais com external_id = Phone Number ID ou número de exibição.', {
              phoneNumberId,
              displayPhoneNumber,
              tried: ['whatsapp:' + phoneNumberId, displayPhoneNumber ? 'whatsapp:' + displayPhoneNumber : null],
            });
          }
          continue;
        }

        console.log('[WhatsApp Webhook] Channel found:', {
          channelId: channel.id,
          channelName: channel.name,
        });

        // Processar mensagens recebidas
        if (value.messages && value.messages.length > 0) {
          console.log('[WhatsApp Webhook] Processing', value.messages.length, 'message(s), channelId:', channel.id);
          for (const message of value.messages) {
            try {
              await withRetry(
                () => processWhatsAppMessage(message, value, channel.id, channel.access_token),
                { retries: 2, isRetryable: isNetworkError }
              );
              console.log('[WhatsApp Webhook] Message processed successfully:', message.id);
            } catch (error) {
              console.error('[WhatsApp Webhook] Error processing message:', error, {
                messageId: message.id,
                from: message.from,
              });
            }
          }
        } else {
          console.log('[WhatsApp Webhook] No messages in this webhook');
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

    // A API não expõe email; extrair da mensagem se o texto parecer um email
    const extractedEmail = extractEmailFromText(normalized.body);

    // Upsert contato
    const contactRecord = await upsertContact({
      channelType: 'whatsapp',
      externalId: from,
      name: contact?.profile?.name,
      phone: from,
      email: extractedEmail,
    });

    // Atribuir origem de campanha (Facebook Ads, Instagram etc.)
    const existingCampaign = (contactRecord.metadata as Record<string, unknown>)?.campaign;
    if (!existingCampaign) {
      let leadUtm: { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string; attributed_at: string } | null = null;

      // 1) Redirecionamento direto: código (ref) em qualquer lugar da mensagem (ex.: "Olá! 👋 Quero conversar. 2KCR4SYH")
      const refResult = await getLeadTrackingByRefFromMessage(normalized.body, 7);
      if (refResult) {
        leadUtm = refResult.utm;
        const phoneCanon = normalizePhoneCanonical(from);
        if (phoneCanon) await markLeadTrackingRefUsed(refResult.ref, phoneCanon);
      }
      // 2) Fluxo com formulário: busca por telefone
      if (!leadUtm) leadUtm = await getRecentLeadTrackingByPhone(from, 7);

      if (leadUtm) {
        const metadata = (contactRecord.metadata as Record<string, unknown>) || {};
        metadata.campaign = {
          utm_source: leadUtm.utm_source,
          utm_medium: leadUtm.utm_medium,
          utm_campaign: leadUtm.utm_campaign,
          utm_content: leadUtm.utm_content,
          utm_term: leadUtm.utm_term,
          attributed_at: leadUtm.attributed_at,
        };
        await supabaseAdmin
          .from('contacts')
          .update({ metadata, updated_at: new Date().toISOString() })
          .eq('id', contactRecord.id);

        // Facebook Conversions API: envia Lead para atribuição no Ads Manager
        const { sendFacebookCAPILead } = await import('../services/facebook-capi');
        const eventId = `wa_lead_${contactRecord.id}_${message.id}`;
        void sendFacebookCAPILead({
          phone: from,
          email: extractedEmail,
          eventId,
          utmSource: leadUtm.utm_source,
          utmMedium: leadUtm.utm_medium,
          utmCampaign: leadUtm.utm_campaign,
          utmContent: leadUtm.utm_content,
          utmTerm: leadUtm.utm_term,
        }).catch(() => {});
      }
    }

    // Buscar ou criar conversa
    console.log('[WhatsApp Webhook] Finding or creating conversation', { channelId, contactId: contactRecord.id });
    const conversation = await findOrCreateConversation({
      channelId,
      contactId: contactRecord.id,
    });
    console.log('[WhatsApp Webhook] Conversation ready', { conversationId: conversation.id });

    // Processar mídia se houver
    let mediaUrl: string | undefined;
    let mediaMimeType: string | undefined;
    let mediaFilename: string | undefined;
    let mediaSize: number | undefined;

    if (normalized.mediaId) {
      try {
        const mediaInfo = await storeWhatsAppMediaInSupabase(
          normalized.mediaId,
          accessToken,
          conversation.id,
          {
            mimeType: undefined,
            contentType: normalized.contentType,
            filename: normalized.mediaFilename,
          }
        );
        mediaUrl = mediaInfo.url;
        mediaMimeType = mediaInfo.mimeType;
        const isSupabaseUrl = mediaUrl?.includes('supabase.co') && mediaUrl?.includes('/storage/');
        if (!isSupabaseUrl) {
          console.warn('[WhatsApp Webhook] Mídia não foi salva no Supabase; usando URL temporária da Meta (pode expirar).', {
            mediaId: normalized.mediaId,
            contentType: normalized.contentType,
          });
        }
      } catch (error) {
        console.error('[WhatsApp Webhook] Erro ao processar mídia:', error, {
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

    // IA: se piloto ativo e mensagem é texto, IA responde direto (ou classifica + escala)
    const isTextWithBody = normalized.contentType === 'text' && normalized.body?.trim();
    if (!isTextWithBody) {
      console.log('[WhatsApp Webhook] IA não acionada: mensagem não é texto ou body vazio', {
        contentType: normalized.contentType,
        bodyLength: normalized.body?.length ?? 0,
        conversationId: conversation.id,
      });
    } else {
      const { isAutopilotEnabled } = await import('../ia/autopilot');
      const enabled = await isAutopilotEnabled();
      if (!enabled) {
        console.log('[WhatsApp Webhook] IA não acionada: piloto desativado (ative em Configurações > IA)', {
          conversationId: conversation.id,
        });
      } else {
        console.log('[WhatsApp Webhook] Acionando IA para conversa', { conversationId: conversation.id });
        const { handleIAReply } = await import('../ia/reply');
        handleIAReply({
          conversationId: conversation.id,
          channelId,
          accessToken,
          contactPhone: contactRecord.phone || normalized.contactExternalId || '',
          contactName: contactRecord.name ?? undefined,
          contactMetadata: contactRecord.metadata ?? undefined,
          contactId: contactRecord.id,
          messageBody: normalized.body,
        }).catch((err) => {
          console.error('[WhatsApp Webhook] IA reply:', err);
        });
      }
    }

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
  let mediaFilename: string | undefined;

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
    mediaFilename = message.document.filename;
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
    mediaFilename,
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

    const updated = await updateMessageStatus(
      status.id,
      newStatus,
      status.errors?.[0]?.message
    );

    if (updated) {
      console.debug('WhatsApp message status updated', {
        externalId: status.id,
        status: newStatus,
      });
    }
    // Se updated === null, a mensagem ainda não está no banco (ex.: status chegou antes) — ignorar em silêncio
  } catch (error) {
    console.error('Error processing WhatsApp status', error, {
      statusId: status.id,
    });
  }
}
