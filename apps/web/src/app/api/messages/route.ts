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
          const usedId = channel?.external_id || '';
          return NextResponse.json(
            {
              error: 'Não foi possível enviar pelo Instagram.',
              hint: `O canal está usando o ID "${usedId}" para enviar. Se for 17841403342667626, esse é o ID da CONTA do Instagram (Contas do Instagram). Para ENVIAR mensagens a API exige o ID da PÁGINA do Facebook: no Meta Business Suite (business.facebook.com) vá em Configurações → Contas → Páginas (não "Contas do Instagram"), abra a página vinculada à sua conta Instagram e copie o ID dessa página. Em Configurações → Canais, edite o canal e coloque esse ID da Página no campo "External ID". Mantenha 17841403342667626 no campo "ID da conta do Instagram" (para receber).`,
            },
            { status: 400 }
          );
        }
      }

      // Instagram 500 da Meta: "An unknown error has occurred"
      if (channel?.type === 'instagram' && statusCode === 500) {
        const data = error?.response?.data;
        const metaError = data?.error;
        const metaMsg = typeof metaError?.message === 'string' ? metaError.message : '';
        const metaCode = metaError?.code ?? '';
        const fbtraceId = metaError?.fbtrace_id ?? (typeof metaError === 'object' && metaError && 'fbtrace_id' in metaError ? (metaError as { fbtrace_id?: string }).fbtrace_id : undefined);
        const headerDebug = error?.response?.headers?.['debug-link'] ?? error?.response?.headers?.get?.('debug-link');
        const debugUrl =
          typeof headerDebug === 'string'
            ? headerDebug
            : fbtraceId
              ? `https://www.meta.com/debug/?mid=${encodeURIComponent(fbtraceId)}`
              : undefined;
        console.error('[Instagram send] Meta 500:', JSON.stringify({ metaMsg, metaCode, fbtraceId, error: metaError, fullBody: data }));
        const hintParts = [
          'A API do Instagram retornou erro interno (500).',
          metaMsg ? `Meta: "${metaMsg}"` : null,
          debugUrl ? `Detalhes: ${debugUrl}` : null,
          'Confira: 1) No Instagram (app móvel): Configurações → Mensagens e respostas a stories → Controles de mensagem → Ferramentas conectadas → ative "Permitir acesso às mensagens". 2) Só é possível enviar mensagem para quem te enviou uma mensagem nas últimas 24h. 3) Se o app está em modo Desenvolvimento, o destinatário precisa ser adicionado como testador no app. 4) Tente novamente em alguns minutos.',
        ].filter(Boolean);
        return NextResponse.json(
          { error: 'Erro ao enviar pelo Instagram.', hint: hintParts.join(' '), debugUrl: debugUrl ?? undefined },
          { status: 502 }
        );
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
