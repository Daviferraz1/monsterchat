import axios from 'axios';

const GRAPH_API_VERSION = 'v23.0';

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
 * A mensagem continua sendo processada; o contato fica só com o ID (sem nome/foto da API).
 */
export async function getInstagramUserProfile(
  igScopedUserId: string,
  accessToken: string
): Promise<InstagramUserProfile | null> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(igScopedUserId)}`;
    const { data } = await axios.get<InstagramUserProfile>(url, {
      params: { fields: 'name,username,profile_pic', access_token: accessToken },
      timeout: 10000,
    });
    return data;
  } catch (err) {
    const data = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
    const msg = typeof data?.message === 'string' ? data.message : null;
    const code = data?.code;
    // 803 = IGSID not found (perfil não disponível para este ID/token); consent/bloqueio = esperado
    if (code === 803 || (msg && /IGSID not found|consent|required|blocked/i.test(String(msg)))) {
      console.debug('[Instagram] Perfil não disponível:', msg || `code ${code}`);
    } else if (msg || err) {
      console.warn('[Instagram] Erro ao buscar perfil:', msg || err);
    }
    return null;
  }
}

export interface InstagramSendTextParams {
  pageId: string;
  accessToken: string;
  recipientId: string;
  text: string;
  /**
   * Quando true, envia com messaging_type MESSAGE_TAG e tag HUMAN_AGENT.
   * Use para respostas fora da janela de 24h (até 7 dias), para que a Meta registre uso do recurso Human Agent.
   * Dentro da janela de 24h o envio usa RESPONSE (padrão).
   */
  useHumanAgentTag?: boolean;
}

export interface InstagramSendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export async function sendInstagramText(params: InstagramSendTextParams) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${params.pageId}/messages`;
  const payload: Record<string, unknown> = {
    recipient: { id: params.recipientId },
    message: { text: params.text },
  };
  if (params.useHumanAgentTag) {
    payload.messaging_type = 'MESSAGE_TAG';
    payload.tag = 'HUMAN_AGENT';
  } else {
    payload.messaging_type = 'RESPONSE';
  }

  const response = await axios.post<InstagramSendMessageResponse>(
    url,
    payload,
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('Instagram message sent:', {
    pageId: params.pageId,
    recipientId: params.recipientId,
    messageId: response.data.message_id,
  });

  return response.data;
}
