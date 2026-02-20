import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import {
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppVideo,
  sendWhatsAppAudio,
  sendWhatsAppDocument,
} from '@/lib/api/services/whatsapp';
import { sendInstagramText } from '@/lib/api/services/instagram';
import { createMessage } from '@/lib/api/services/message';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type MediaContentType = 'image' | 'video' | 'audio' | 'document';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      conversation_id,
      text,
      sender_id,
      media_url,
      content_type: rawContentType,
      caption,
      filename,
    } = body;

    const hasText = typeof text === 'string' && text.trim().length > 0;
    const hasMedia =
      typeof media_url === 'string' &&
      media_url.trim().length > 0 &&
      ['image', 'video', 'audio', 'document'].includes(rawContentType);
    const contentType = hasMedia ? (rawContentType as MediaContentType) : null;

    if (!conversation_id) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 }
      );
    }
    if (!hasText && !hasMedia) {
      return NextResponse.json(
        { error: 'Envie text ou media_url + content_type (image|video|audio|document)' },
        { status: 400 }
      );
    }

    // Buscar conversa e canal
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        channel:channels(*),
        contact:contacts(*)
      `)
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const channel = conversation.channel;
    const contact = conversation.contact;

    if (!channel || !contact) {
      return NextResponse.json(
        { error: 'Channel or contact not found' },
        { status: 404 }
      );
    }

    const displayText = hasText ? text : (caption ?? '');
    let externalId: string | undefined;
    let status: 'pending' | 'sent' | 'failed' = 'pending';

    try {
      if (channel.type === 'whatsapp') {
        if (hasMedia && contentType) {
          const mediaParams = {
            phoneNumberId: channel.external_id,
            accessToken: channel.access_token,
            to: contact.external_id,
            mediaUrl: media_url,
            caption: displayText || undefined,
            filename: filename || undefined,
          };
          let response: { messages?: { id: string }[] };
          if (contentType === 'image') {
            response = await sendWhatsAppImage(mediaParams);
          } else if (contentType === 'video') {
            response = await sendWhatsAppVideo(mediaParams);
          } else if (contentType === 'audio') {
            response = await sendWhatsAppAudio(mediaParams);
          } else {
            response = await sendWhatsAppDocument(mediaParams);
          }
          externalId = response.messages?.[0]?.id;
          status = 'sent';
        } else {
          const response = await sendWhatsAppText({
            phoneNumberId: channel.external_id,
            accessToken: channel.access_token,
            to: contact.external_id,
            text: text || '',
          });
          externalId = response.messages[0]?.id;
          status = 'sent';
        }
      } else if (channel.type === 'instagram') {
        if (hasMedia) {
          return NextResponse.json(
            { error: 'Envio de mídia pelo Instagram ainda não suportado. Use texto.' },
            { status: 400 }
          );
        }
        const response = await sendInstagramText({
          pageId: channel.external_id,
          accessToken: channel.access_token,
          recipientId: contact.external_id,
          text: text || '',
        });
        externalId = response.message_id;
        status = 'sent';
      } else {
        return NextResponse.json(
          { error: 'Unsupported channel type' },
          { status: 400 }
        );
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      status = 'failed';

      // Token expirado (401) → resposta amigável para o usuário atualizar o token
      const statusCode = error?.response?.status;
      const isTokenError =
        statusCode === 401 ||
        (typeof error?.response?.data?.error?.message === 'string' &&
          /token|expired|invalid_token|session/i.test(error.response.data.error.message));

      if (isTokenError) {
        const message = await createMessage({
          conversationId: conversation_id,
          direction: 'outbound',
          senderType: 'agent',
          senderId: sender_id,
          contentType: hasMedia && contentType ? contentType : 'text',
          body: displayText || (hasMedia ? undefined : text),
          mediaUrl: hasMedia ? media_url : undefined,
          externalId: undefined,
          status: 'failed',
        });
        await supabaseAdmin
          .from('conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: text,
            last_agent_reply_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversation_id);

        return NextResponse.json(
          {
            error:
              'Token do canal expirado. Atualize o token em Configurações → Canais.',
            message,
          },
          { status: 401 }
        );
      }

      // Instagram 400: "Application does not have the capability" → External ID deve ser Page ID (Facebook)
      if (channel?.type === 'instagram' && statusCode === 400) {
        const errMsg = String(error?.response?.data?.error?.message ?? error?.response?.data?.error?.error_user_msg ?? '');
        if (/capability|invalid_request|does not have/i.test(errMsg)) {
          return NextResponse.json(
            {
              error: 'Não foi possível enviar pelo Instagram. O External ID do canal deve ser o ID da Página do Facebook (Page ID), não o ID da conta do Instagram. Em Configurações → Canais, edite o canal: coloque o Page ID no campo "External ID" (encontre em: Página do Facebook → Configurações → Avançado). No campo "ID da conta do Instagram" mantenha o ID que aparece no webhook (ex.: 17841403342667626). O app também precisa da permissão instagram_manage_messages.',
            },
            { status: 400 }
          );
        }
      }
    }

    const preview =
      displayText.trim()
        ? displayText.slice(0, 80) + (displayText.length > 80 ? '…' : '')
        : hasMedia && contentType
          ? `[${contentType}]`
          : '';

    const message = await createMessage({
      conversationId: conversation_id,
      direction: 'outbound',
      senderType: 'agent',
      senderId: sender_id,
      contentType: hasMedia && contentType ? contentType : 'text',
      body: displayText || (hasMedia ? undefined : text),
      mediaUrl: hasMedia ? media_url : undefined,
      externalId,
      status,
    });

    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: preview,
        last_agent_reply_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    return NextResponse.json(message);
  } catch (error: any) {
    console.error('Error in message send route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
