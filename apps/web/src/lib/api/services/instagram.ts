import axios from 'axios';

/** Resposta da API de perfil do usuário Instagram (User Profile API). */
export interface InstagramUserProfile {
  name?: string;
  username?: string;
  profile_pic?: string;
}

/**
 * Busca nome e foto do perfil do usuário Instagram (requer consentimento após ele enviar mensagem).
 * https://developers.facebook.com/docs/messenger-platform/instagram/features/user-profile
 */
export async function getInstagramUserProfile(
  igScopedUserId: string,
  accessToken: string
): Promise<InstagramUserProfile | null> {
  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(igScopedUserId)}`;
    const { data } = await axios.get<InstagramUserProfile>(url, {
      params: { fields: 'name,username,profile_pic', access_token: accessToken },
      timeout: 10000,
    });
    return data;
  } catch (err) {
    const msg = axios.isAxiosError(err) ? err.response?.data?.error?.message : null;
    if (msg && /consent|required|blocked/i.test(String(msg))) {
      console.debug('[Instagram] Perfil não disponível (consentimento ou bloqueio):', msg);
    } else {
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
}

export interface InstagramSendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export async function sendInstagramText(params: InstagramSendTextParams) {
  const url = `https://graph.facebook.com/v21.0/${params.pageId}/messages`;
  
  const response = await axios.post<InstagramSendMessageResponse>(
    url,
    {
      recipient: {
        id: params.recipientId,
      },
      message: {
        text: params.text,
      },
    },
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
