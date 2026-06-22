import axios from 'axios';
import { sanitizeTokenForHeader } from '../utils';

const GRAPH_API_VERSION = 'v23.0';

/** Base/versão da API nova do Instagram (Instagram Login) — mesma usada para enviar mensagens. */
const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com';
const INSTAGRAM_API_VERSION = 'v21.0';

/** Resposta da API de perfil do usuário Instagram (User Profile API). */
export interface InstagramUserProfile {
  name?: string;
  username?: string;
  profile_pic?: string;
}

/**
 * Busca nome e foto do perfil do usuário Instagram (requer consentimento após ele enviar mensagem).
 * https://developers.facebook.com/docs/messenger-platform/instagram/features/user-profile
 *
 * Erro 803 "IGSID not found": a Meta não consegue devolver o perfil. Causas comuns:
 * - Token não é Page Access Token da Página vinculada ao Instagram (ou sem permissões instagram_basic + instagram_manage_messages).
 * - Usuário bloqueou a empresa no Instagram.
 * - App em modo Desenvolvimento e usuário não é testador.
 * Erro 100 "page is not linked / not professional account": a Página não está vinculada à conta IG ou a conta IG não é profissional.
 * A mensagem continua sendo processada; o contato fica só com o ID (e fallback de nome) quando o perfil não está disponível.
 */
export async function getInstagramUserProfile(
  igScopedUserId: string,
  accessToken: string
): Promise<InstagramUserProfile | null> {
  const token = sanitizeTokenForHeader(accessToken);
  const id = encodeURIComponent(igScopedUserId);
  const fields = 'name,username,profile_pic';

  // Ordem: API nova (Instagram Login, graph.instagram.com — mesma do envio) e, como
  // fallback, a API antiga (Page token, graph.facebook.com). O token do canal aqui é
  // de Instagram Login, então o graph.facebook.com antigo não resolvia o IGSID (erro 803)
  // e o nome caía no fallback "Instagram <id>".
  const endpoints = [
    `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/${id}`,
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${id}`,
  ];

  let lastErr: unknown;
  for (const url of endpoints) {
    try {
      const { data } = await axios.get<InstagramUserProfile>(url, {
        params: { fields, access_token: token },
        timeout: 10000,
      });
      if (data && (data.name || data.username || data.profile_pic)) return data;
    } catch (err) {
      lastErr = err;
      // tenta o próximo endpoint
    }
  }

  const data = axios.isAxiosError(lastErr) ? lastErr.response?.data?.error : undefined;
  const msg = typeof data?.message === 'string' ? data.message : null;
  const code = data?.code;
  // 803 = IGSID not found; 100 = page not linked / IG not professional — perfil indisponível, mensagem segue normalmente
  const isExpectedProfileError =
    code === 803 ||
    code === 100 ||
    (msg && /IGSID not found|consent|required|blocked|page is not linked|not professional account/i.test(String(msg)));
  if (isExpectedProfileError) {
    console.debug('[Instagram] Perfil não disponível:', msg || `code ${code}`);
  } else if (msg || lastErr) {
    console.warn('[Instagram] Erro ao buscar perfil:', msg || lastErr);
  }
  return null;
}

export interface InstagramSendTextParams {
  /** Não usado na API nova (graph.instagram.com/me/messages); o token identifica a conta. Mantido para compatibilidade. */
  pageId?: string;
  accessToken: string;
  /** IGSID (Instagram-Scoped ID) do destinatário — o mesmo recebido no webhook em sender.id. NÃO é username nem ID público. */
  recipientId: string;
  text: string;
  /**
   * Quando true, envia com messaging_type MESSAGE_TAG e tag HUMAN_AGENT (API antiga).
   * Na API nova (graph.instagram.com) pode não ser suportado; fora da janela de 24h só templates aprovados.
   */
  useHumanAgentTag?: boolean;
}

export interface InstagramSendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export async function sendInstagramText(params: InstagramSendTextParams) {
  const url = `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/me/messages`;
  const token = sanitizeTokenForHeader(params.accessToken);

  const payload = {
    recipient: { id: params.recipientId },
    message: { text: params.text },
  };
  // API nova graph.instagram.com: apenas recipient (IGSID) + message. Sem messaging_type/tag.

  try {
    const response = await axios.post<InstagramSendMessageResponse>(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Instagram message sent:', {
      recipientId: params.recipientId,
      messageId: response.data.message_id,
    });

    return response.data;
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    const data = axios.isAxiosError(err) ? err.response?.data : undefined;
    console.error('[Instagram send] Erro completo da API:', JSON.stringify({ status, data }));
    throw err;
  }
}
