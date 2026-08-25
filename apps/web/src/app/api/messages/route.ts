import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import {
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppVideo,
  sendWhatsAppAudio,
  sendWhatsAppDocument,
} from '@/lib/api/services/whatsapp';
import { sendInstagramText, sendInstagramMedia, INSTAGRAM_MEDIA_LIMITS, type InstagramMediaType } from '@/lib/api/services/instagram';
import { createMessage } from '@/lib/api/services/message';
import { apiEnv } from '@/lib/api/env';
import { getTeamContext } from '@/lib/api/team';

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

    // Quem enviou vem da SESSÃO, nunca do corpo da requisição: sender_id era um campo
    // livre do cliente e por isso nunca deu para confiar em estatística por operador.
    const agent = await getTeamContext();
    const agentUserId = agent?.userId ?? null;

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
      if (channel.type === 'whatsapp_baileys') {
        const toPhone = (contact.phone || contact.external_id || '').replace(/\D/g, '');
        const toJid = toPhone.length >= 10 ? toPhone : contact.external_id;
        if (!toJid) {
          return NextResponse.json(
            { error: 'Contato sem número para envio via Baileys.' },
            { status: 400 }
          );
        }
        const apiUrl = (apiEnv.API_URL || '').replace(/\/$/, '');
        if (!apiUrl) {
          return NextResponse.json(
            { error: 'API_URL não configurada. Configure para usar o canal WhatsApp (QR).' },
            { status: 503 }
          );
        }
        const body: { channelId: string; to: string; text?: string; mediaUrl?: string; contentType?: string; caption?: string; filename?: string } = {
          channelId: channel.id,
          to: toJid,
        };
        if (hasMedia && contentType) {
          body.mediaUrl = media_url;
          body.contentType = contentType;
          body.caption = displayText || undefined;
          body.filename = filename || undefined;
        } else {
          body.text = text || '';
        }
        const sendRes = await fetch(`${apiUrl}/baileys/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': apiEnv.INTERNAL_API_SECRET || '',
          },
          body: JSON.stringify(body),
        });
        const sendData = await sendRes.json().catch(() => ({}));
        if (!sendRes.ok) {
          throw new Error(sendData.error || `API Baileys: ${sendRes.status}`);
        }
        externalId = sendData.externalId;
        status = 'sent';
      } else if (channel.type === 'whatsapp') {
        // Contatos da Guru podem ter external_id = e-mail; WhatsApp exige número. Preferir contact.phone.
        const phoneDigits = (contact.phone || '').replace(/\D/g, '');
        const toForWhatsApp = phoneDigits.length >= 10 ? (contact.phone || '') : contact.external_id;

        if (hasMedia && contentType) {
          const mediaParams = {
            phoneNumberId: channel.external_id,
            accessToken: channel.access_token,
            to: toForWhatsApp,
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
            to: toForWhatsApp,
            text: text || '',
          });
          externalId = response.messages[0]?.id;
          status = 'sent';
        }
      } else if (channel.type === 'instagram') {
        const igBase = {
          pageId: channel.external_id,
          accessToken: channel.access_token,
          recipientId: contact.external_id,
        };

        if (hasMedia && contentType) {
          // 'document' aqui é o nome interno; na Meta o tipo se chama 'file' (só PDF).
          const mediaType = (contentType === 'document' ? 'file' : contentType) as InstagramMediaType;
          if (!(mediaType in INSTAGRAM_MEDIA_LIMITS)) {
            return NextResponse.json(
              { error: `O Instagram não aceita envio de "${contentType}".`, hint: 'Tipos aceitos: foto, áudio, vídeo e PDF.' },
              { status: 400 }
            );
          }

          const response = await sendInstagramMedia({ ...igBase, mediaType, mediaUrl: media_url });
          externalId = response.message_id;
          status = 'sent';

          // O direct do Instagram não aceita legenda junto do anexo: vai como mensagem separada.
          // Se só a legenda falhar, o anexo já foi — não derruba o envio, apenas registra.
          if (displayText?.trim()) {
            try {
              await sendInstagramText({ ...igBase, text: displayText });
            } catch (captionErr) {
              console.error('[Instagram send] Anexo enviado, mas a legenda falhou:', captionErr);
            }
          }
        } else {
          const response = await sendInstagramText({ ...igBase, text: text || '' });
          externalId = response.message_id;
          status = 'sent';
        }
      } else {
        return NextResponse.json(
          { error: 'Unsupported channel type' },
          { status: 400 }
        );
      }
    } catch (error: any) {
      status = 'failed';

      const statusCode = error?.response?.status;
      const errorMessage = typeof error?.response?.data?.error?.message === 'string'
        ? error.response.data.error.message
        : '';
      const errMsg = typeof error?.message === 'string' ? error.message : '';

      // Invalid character in header (token colado com quebra de linha ou caractere inválido)
      if (/Invalid character in header content|Authorization/i.test(errMsg)) {
        return NextResponse.json(
          {
            error: 'Token do canal com caractere inválido no cabeçalho.',
            hint: 'O token pode ter sido colado com quebra de linha ou espaço extra. Em Configurações → Canais, edite o canal, copie o token de novo (uma linha só, sem quebras) e salve. O app também tenta corrigir isso automaticamente.',
          },
          { status: 400 }
        );
      }

      // Instagram (#200): o app está com Acesso Padrão em instagram_manage_messages, e nesse
      // nível a Meta só entrega para quem tem função no app. Por isso o teste para a própria
      // conta funciona e o envio para um lead real falha — não é token nem formato.
      // Precisa vir ANTES do tratamento de anexo, senão o erro é atribuído ao formato do arquivo.
      const metaCodeRaw = error?.response?.data?.error?.code;
      if (
        channel?.type === 'instagram' &&
        (metaCodeRaw === 200 || /advanced access|acesso avançado|does not have a role|não tem função/i.test(errorMessage))
      ) {
        console.error('[Instagram send] Acesso Padrão bloqueando envio para não-testador:', { errorMessage });
        return NextResponse.json(
          {
            error: 'O app da Meta ainda não tem permissão para falar com clientes.',
            hint:
              'A permissão instagram_manage_messages está com Acesso Padrão, e nesse nível o Instagram só entrega mensagem para quem tem função no app (administrador, desenvolvedor ou testador). Por isso responder para a sua própria conta funciona e para um cliente real não. ' +
              'Para liberar: no painel da Meta (developers.facebook.com) → seu app → Análise do app → Permissões e recursos → instagram_manage_messages → "Solicitar acesso avançado". Exige Verificação da Empresa concluída. ' +
              'Enquanto a análise não sai, dá para atender apenas contas adicionadas em Funções do app → Testadores.',
            debugUrl: '/api/diagnostic/instagram',
          },
          { status: 403 }
        );
      }

      // Instagram + anexo: a Meta recusa formato fora da lista dela com erro genérico. O áudio
      // gravado no chat sai em ogg, que o WhatsApp aceita e o Instagram não — sem esta dica o
      // atendente só via "erro ao enviar" sem saber o motivo.
      if (channel?.type === 'instagram' && hasMedia && contentType) {
        const igType = (contentType === 'document' ? 'file' : contentType) as InstagramMediaType;
        const aceitos = INSTAGRAM_MEDIA_LIMITS[igType];
        console.error('[Instagram send] Falha ao enviar anexo:', { statusCode, errorMessage, contentType, mediaUrl: media_url });
        return NextResponse.json(
          {
            error: 'Não foi possível enviar esse anexo pelo Instagram.',
            hint: `O Instagram aceita ${aceitos} para ${contentType === 'document' ? 'documento' : contentType}. Formato fora dessa lista é recusado mesmo funcionando no WhatsApp — áudio gravado aqui sai em ogg, que o Instagram não aceita. Resposta da Meta: ${errorMessage || `HTTP ${statusCode ?? '?'}`}`,
          },
          { status: 400 }
        );
      }

      // Instagram: token do tipo errado para o endpoint (causa clássica de "recebe mas não envia").
      // O webhook não usa token, então o recebimento continua normal enquanto todo envio falha com 190.
      if (channel?.type === 'instagram' && /Cannot parse access token|must be called with a Page Access Token/i.test(errorMessage)) {
        const isParse = /Cannot parse access token/i.test(errorMessage);
        return NextResponse.json(
          {
            error: 'Token do canal não serve para o endpoint de envio do Instagram.',
            hint: isParse
              ? 'O token é do Facebook (EAA...) e foi enviado para graph.instagram.com, que só aceita token do Instagram Login (IGA...). Preencha o "External ID" do canal com o ID da Página do Facebook vinculada ao Instagram — o app passa a enviar por graph.facebook.com/{page-id}/messages. Alternativa: gerar um token pelo Instagram Login e colar no canal.'
              : 'O token é de Usuário do Sistema e a Meta exige o Page Access Token da Página. O app tenta derivar o token da Página automaticamente; se falhou, dê a esse usuário do sistema acesso à Página e a permissão pages_show_list, ou cole direto o Page Access Token no canal.',
            debugUrl: '/api/diagnostic/instagram',
          },
          { status: 401 }
        );
      }

      // 401 ou mensagem que mencione token inválido/expirado → uma única mensagem (evita "expirado" quando o token é permanente mas há outro problema)
      const isTokenRelated =
        statusCode === 401 ||
        /invalid.*token|invalid_token|access token|token.*invalid|expired|token has expired|session expired|expirado/i.test(errorMessage);

      if (isTokenRelated) {
        console.warn('[Send message] Erro de token/401:', { statusCode, errorMessage, channelType: channel?.type, externalId: channel?.external_id });
        const tokenMessage =
          'Token do canal inválido ou sem permissão. Em Configurações → Canais, confira: 1) Use um token permanente (Usuário do sistema ou token da Página) com permissões de mensagens. 2) Instagram: External ID = ID da Página do Facebook vinculada ao Instagram; WhatsApp: External ID = Phone Number ID. Se acabou de colar um token novo, salve o canal e tente enviar de novo.';

        const message = await createMessage({
          conversationId: conversation_id,
          direction: 'outbound',
          senderType: 'agent',
          senderId: agentUserId ?? sender_id,
          agentUserId,
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
            error: tokenMessage,
            message,
          },
          { status: 401 }
        );
      }

      // Instagram + (#100) "messaging_product is required" → o External ID está como Phone Number ID (WhatsApp), não Page ID
      if (channel?.type === 'instagram' && statusCode === 400 && /messaging_product is required/i.test(errorMessage)) {
        const usedId = channel?.external_id || '';
        return NextResponse.json(
          {
            error: 'Canal Instagram com External ID incorreto.',
            hint: `A API está tratando o envio como WhatsApp porque o "External ID" do canal (${usedId}) é um Phone Number ID, não o ID da Página do Facebook. Em Configurações → Canais, edite o canal Instagram e no campo "External ID" coloque o ID da PÁGINA do Facebook vinculada ao Instagram (em business.facebook.com → Configurações → Contas → Páginas → abra a página → copie o ID). Não use o Phone Number ID do WhatsApp. Mantenha o "ID da conta do Instagram" como está (para receber mensagens).`,
          },
          { status: 400 }
        );
      }

      // Instagram: janela de 24h expirada ou fora da sessão (API nova ou antiga)
      if (channel?.type === 'instagram' && (statusCode === 400 || statusCode === 403)) {
        const errMsg = String(error?.response?.data?.error?.message ?? error?.response?.data?.error?.error_user_msg ?? errorMessage);
        if (/24.?hour|24h|window|session|outside|expirada|janela|template/i.test(errMsg)) {
          return NextResponse.json(
            {
              error: 'Não é possível enviar essa mensagem agora.',
              hint: 'Só é possível enviar para quem te enviou uma mensagem nas últimas 24 horas. Peça ao contato para enviar uma nova mensagem e responda em seguida. Fora da janela de 24h só são permitidos Message Templates (se aprovados no app).',
            },
            { status: 400 }
          );
        }
      }

      // Instagram 400: "Application does not have the capability" (API antiga via Page ID)
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

      // Instagram 500 da Meta: "An unknown error has occurred" — sempre devolver JSON amigável, não relançar
      if (channel?.type === 'instagram' && statusCode === 500) {
        try {
          const data = error?.response?.data;
          const metaError = data?.error;
          const metaMsg = typeof metaError?.message === 'string' ? metaError.message : '';
          const metaCode = metaError?.code ?? '';
          const fbtraceId = metaError?.fbtrace_id ?? (typeof metaError === 'object' && metaError && 'fbtrace_id' in metaError ? (metaError as { fbtrace_id?: string }).fbtrace_id : undefined);
          const headers = error?.response?.headers;
          const headerDebugLink =
            (typeof headers?.get === 'function' ? headers.get('debug-link') : null) ??
            headers?.['debug-link'];
          const errorMid = typeof headers?.get === 'function' ? headers.get('error-mid') : headers?.['error-mid'];
          const debugUrl =
            (typeof headerDebugLink === 'string' && headerDebugLink.startsWith('http') ? headerDebugLink : null) ??
            (typeof errorMid === 'string' && errorMid ? `https://www.meta.com/debug/?mid=${encodeURIComponent(errorMid)}` : null) ??
            (fbtraceId ? `https://www.meta.com/debug/?mid=${encodeURIComponent(fbtraceId)}` : undefined);
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
        } catch (innerErr) {
          console.error('[Instagram send] Erro ao montar resposta 502:', innerErr);
          return NextResponse.json(
            { error: 'Erro ao enviar pelo Instagram.', hint: 'A API da Meta retornou 500. Confira as permissões do canal, janela de 24h e se o destinatário é testador (app em desenvolvimento). Detalhes: https://www.meta.com/debug/' },
            { status: 502 }
          );
        }
      }

      // Erro não tratado acima: log completo e resposta com detalhe da Meta quando houver
      const data = error?.response?.data;
      const metaError = data?.error;
      const metaMsg =
        typeof metaError?.message === 'string'
          ? metaError.message
          : typeof metaError?.error_user_msg === 'string'
            ? metaError.error_user_msg
            : typeof data?.message === 'string'
              ? data.message
              : metaError && typeof metaError === 'object'
                ? JSON.stringify(metaError)
                : undefined;

      // WhatsApp (#131009) Parameter value is not valid — número ou parâmetro em formato inválido
      const errorCode = metaError?.code ?? (typeof metaError === 'object' && metaError && 'code' in metaError ? (metaError as { code?: number }).code : undefined);
      if (channel?.type === 'whatsapp' && (errorCode === 131009 || /131009|Parameter value is not valid/i.test(String(metaMsg ?? '')))) {
        return NextResponse.json(
          {
            error: 'Número do destinatário ou parâmetro inválido.',
            hint: 'A API WhatsApp retornou (#131009). O número do contato deve conter só dígitos (ex.: 5511999999999). O sistema já normaliza o número automaticamente; se o erro continuar, confira em Contatos se o telefone do destinatário está correto e se o número está registrado no WhatsApp.',
          },
          { status: 400 }
        );
      }

      console.error('Error sending message:', {
        status: statusCode,
        statusText: error?.response?.statusText,
        metaMessage: metaMsg,
        channelType: channel?.type,
        externalId: channel?.external_id,
      });
      const hint = metaMsg
        ? `Detalhe da API: ${metaMsg}`
        : `HTTP ${statusCode ?? 'erro'}. Verifique Configurações → Canais (token, External ID) e os logs do servidor.`;
      return NextResponse.json(
        { error: 'Falha ao enviar mensagem.', hint },
        { status: 502 }
      );
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
      senderId: agentUserId ?? sender_id,
      agentUserId,
      contentType: hasMedia && contentType ? contentType : 'text',
      body: displayText || (hasMedia ? undefined : text),
      mediaUrl: hasMedia ? media_url : undefined,
      externalId,
      status,
    });

    const now = new Date().toISOString();
    const conversationPatch: Record<string, unknown> = {
      last_message_at: now,
      last_message_preview: preview,
      last_agent_reply_at: now,
      updated_at: now,
    };
    if (!conversation.first_response_at) {
      conversationPatch.first_response_at = now;
    }
    // Responder NÃO atribui a conversa a ninguém.
    //
    // Atribuição é ato deliberado entre membros da equipe (diálogo de transferência)
    // — virava tarefa no quadro só porque alguém mandou uma mensagem, e o quadro
    // enchia sozinho de coisa que ninguém combinou.
    //
    // Quem está atendendo continua visível: vem de `agent_user_id` na mensagem, que
    // é o autor real da resposta, e aparece no chat e no painel. Atribuir a conversa
    // também mexeria na visibilidade dos outros (departamento definido no chute
    // esconde a conversa de quem não é do setor), o que é pior que não atribuir.

    await supabaseAdmin
      .from('conversations')
      .update(conversationPatch)
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
