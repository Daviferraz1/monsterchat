import axios from 'axios';
import { sanitizeTokenForHeader } from '../utils';
import { needsPageAccessToken, resolvePageAccessToken } from './instagram';

const GRAPH_API_VERSION = 'v23.0';
const FACEBOOK_GRAPH_BASE = 'https://graph.facebook.com';

/**
 * Messenger da Página do Facebook.
 *
 * É a mesma Messenger Platform do caminho "Facebook Login for Business" do Instagram:
 * `POST /{page-id}/messages` com o **Page Access Token**. O que muda é o destinatário
 * (PSID, o `sender.id` do webhook com `object: "page"`) e a permissão: `pages_messaging`.
 * https://developers.facebook.com/docs/messenger-platform/send-messages
 */

/** O Messenger recusa texto acima de 2000 caracteres. */
export const LIMITE_MESSENGER = 2000;

export interface MessengerUserProfile {
  name?: string;
  profile_pic?: string;
}

/**
 * Nome e foto de quem escreveu para a Página (User Profile API, pelo PSID).
 * Quando a Meta não devolve o perfil (app sem acesso avançado, usuário bloqueou a Página),
 * a mensagem segue normalmente e o contato fica com o nome de fallback.
 * https://developers.facebook.com/docs/messenger-platform/identity/user-profile
 */
export async function getMessengerUserProfile(
  psid: string,
  accessToken: string,
  pageId?: string
): Promise<MessengerUserProfile | null> {
  const token = sanitizeTokenForHeader(accessToken);
  const url = `${FACEBOOK_GRAPH_BASE}/${GRAPH_API_VERSION}/${encodeURIComponent(psid)}`;

  // Com token de usuário do sistema o perfil só resolve com o Page Access Token.
  const tokens = [token];
  if (pageId) {
    const pageToken = await resolvePageAccessToken(pageId, token);
    if (pageToken && pageToken !== token) tokens.unshift(pageToken);
  }

  let lastErr: unknown;
  for (const candidate of tokens) {
    try {
      const { data } = await axios.get<{ name?: string; first_name?: string; last_name?: string; profile_pic?: string }>(url, {
        params: { fields: 'name,first_name,last_name,profile_pic', access_token: candidate },
        timeout: 10000,
      });
      const name = data?.name || [data?.first_name, data?.last_name].filter(Boolean).join(' ') || undefined;
      if (name || data?.profile_pic) return { name, profile_pic: data.profile_pic };
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    const msg = axios.isAxiosError(lastErr) ? lastErr.response?.data?.error?.message : String(lastErr);
    console.debug('[Messenger] Perfil não disponível:', msg);
  }
  return null;
}

export interface MessengerSendParams {
  /** ID da Página do Facebook (o `external_id` do canal). */
  pageId: string;
  accessToken: string;
  /** PSID (Page-Scoped ID) do destinatário — o `sender.id` recebido no webhook. */
  recipientId: string;
  /**
   * Envia com a tag HUMAN_AGENT, que estende a janela de 24h para 7 dias. Só funciona se o
   * app tiver o recurso "Human Agent" aprovado na análise da Meta.
   */
  useHumanAgentTag?: boolean;
}

export interface MessengerSendResponse {
  recipient_id: string;
  message_id: string;
}

/** Tipos de anexo aceitos pelo Messenger. */
export type MessengerMediaType = 'image' | 'audio' | 'video' | 'file';

export async function sendMessengerText(params: MessengerSendParams & { text: string }) {
  return sendMessengerPayload(params, { text: params.text });
}

/**
 * Envia um anexo pelo Messenger. A Meta baixa o arquivo da URL (até 25 MB), então ela precisa
 * ser pública. Como no direct do Instagram, **não há legenda junto do anexo**: o texto vai
 * como mensagem separada.
 */
export async function sendMessengerMedia(
  params: MessengerSendParams & { mediaType: MessengerMediaType; mediaUrl: string }
) {
  return sendMessengerPayload(params, {
    attachment: { type: params.mediaType, payload: { url: params.mediaUrl, is_reusable: false } },
  });
}

async function sendMessengerPayload(params: MessengerSendParams, message: Record<string, unknown>) {
  const token = sanitizeTokenForHeader(params.accessToken);
  if (!params.pageId) {
    throw new Error('Canal Facebook sem "External ID". O envio precisa do ID da Página do Facebook.');
  }

  const payload: Record<string, unknown> = {
    recipient: { id: params.recipientId },
    messaging_type: params.useHumanAgentTag ? 'MESSAGE_TAG' : 'RESPONSE',
    message,
  };
  if (params.useHumanAgentTag) payload.tag = 'HUMAN_AGENT';

  const url = `${FACEBOOK_GRAPH_BASE}/${GRAPH_API_VERSION}/${encodeURIComponent(params.pageId)}/messages`;
  const post = async (bearer: string) => {
    const response = await axios.post<MessengerSendResponse>(url, payload, {
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    console.log('Messenger message sent:', { recipientId: params.recipientId, messageId: response.data.message_id });
    return response.data;
  };

  try {
    try {
      return await post(token);
    } catch (err) {
      // Token de usuário do sistema: a Meta exige o Page Access Token. Deriva e tenta de novo.
      if (!needsPageAccessToken(err)) throw err;
      const pageToken = await resolvePageAccessToken(params.pageId, token);
      if (!pageToken) throw err;
      console.log('[Messenger send] Token de usuário do sistema trocado pelo Page Access Token.');
      return await post(pageToken);
    }
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    const data = axios.isAxiosError(err) ? err.response?.data : undefined;
    console.error('[Messenger send] Erro completo da API:', JSON.stringify({ status, data }));
    throw err;
  }
}
