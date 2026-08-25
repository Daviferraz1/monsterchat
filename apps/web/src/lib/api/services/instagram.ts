import axios from 'axios';
import { sanitizeTokenForHeader } from '../utils';

const GRAPH_API_VERSION = 'v23.0';
const FACEBOOK_GRAPH_BASE = 'https://graph.facebook.com';

/** Base/versão da API do Instagram Login (graph.instagram.com). Só aceita token do Instagram Login (prefixo IGA...). */
const INSTAGRAM_GRAPH_BASE = 'https://graph.instagram.com';
const INSTAGRAM_API_VERSION = 'v21.0';

/**
 * Existem dois caminhos para mensagens do Instagram e cada um exige um tipo de token:
 *
 * 1. **Instagram Login** (`graph.instagram.com/me/messages`) — token do Instagram, começa com `IGA...`.
 * 2. **Facebook Login for Business** (`graph.facebook.com/{page-id}/messages`) — **Page Access Token**
 *    da Página vinculada à conta Instagram, começa com `EAA...`.
 *
 * Mandar um token `EAA...` para graph.instagram.com devolve 190 "Cannot parse access token", e mandar
 * um token de **usuário do sistema** (também `EAA...`) para /{page-id}/messages devolve 190 "This
 * method must be called with a Page Access Token". Nos dois casos o recebimento continua funcionando
 * (o webhook não usa token) e só o envio quebra.
 */
function isInstagramLoginToken(token: string): boolean {
  return /^IGA/i.test(token);
}

/** Cache em memória do Page Access Token derivado de um token de usuário do sistema. */
const pageTokenCache = new Map<string, string>();

function pageTokenCacheKey(pageId: string, token: string) {
  return `${pageId}:${token.slice(-16)}`;
}

/**
 * Troca um token de usuário do sistema (ou de usuário) pelo Page Access Token da Página.
 * Requer a permissão `pages_show_list`. Page token de usuário do sistema não expira.
 */
async function resolvePageAccessToken(pageId: string, token: string): Promise<string | null> {
  const key = pageTokenCacheKey(pageId, token);
  const cached = pageTokenCache.get(key);
  if (cached) return cached;

  try {
    const { data } = await axios.get<{ access_token?: string }>(
      `${FACEBOOK_GRAPH_BASE}/${GRAPH_API_VERSION}/${encodeURIComponent(pageId)}`,
      { params: { fields: 'access_token', access_token: token }, timeout: 10000 }
    );
    const pageToken = data?.access_token?.trim();
    if (!pageToken) return null;
    pageTokenCache.set(key, pageToken);
    return pageToken;
  } catch (err) {
    const msg = axios.isAxiosError(err) ? err.response?.data?.error?.message : String(err);
    console.warn('[Instagram] Não foi possível derivar o Page Access Token:', msg);
    return null;
  }
}

/** A Meta pede um Page Access Token e o token enviado era de usuário do sistema. */
function needsPageAccessToken(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const error = err.response?.data?.error;
  return error?.code === 190 && /Page Access Token/i.test(String(error?.message ?? ''));
}

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
 * - Token não é o da conta/Página certa (ou sem permissões instagram_basic + instagram_manage_messages).
 * - Usuário bloqueou a empresa no Instagram.
 * - App em modo Desenvolvimento e usuário não é testador.
 * A mensagem continua sendo processada; o contato fica só com o ID (e fallback de nome) quando o
 * perfil não está disponível.
 */
export async function getInstagramUserProfile(
  igScopedUserId: string,
  accessToken: string,
  pageId?: string
): Promise<InstagramUserProfile | null> {
  const token = sanitizeTokenForHeader(accessToken);
  const id = encodeURIComponent(igScopedUserId);
  const fields = 'name,username,profile_pic';

  // O endpoint que resolve o IGSID é o do mesmo caminho usado no envio: Instagram Login resolve em
  // graph.instagram.com; Page token resolve em graph.facebook.com.
  const instagramUrl = `${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/${id}`;
  const facebookUrl = `${FACEBOOK_GRAPH_BASE}/${GRAPH_API_VERSION}/${id}`;
  const igLogin = isInstagramLoginToken(token);
  const endpoints = igLogin ? [instagramUrl, facebookUrl] : [facebookUrl, instagramUrl];

  // Com token de usuário do sistema o perfil também exige Page token.
  const tokens = [token];
  if (!igLogin && pageId) {
    const pageToken = await resolvePageAccessToken(pageId, token);
    if (pageToken && pageToken !== token) tokens.unshift(pageToken);
  }

  let lastErr: unknown;
  for (const candidate of tokens) {
    for (const url of endpoints) {
      try {
        const { data } = await axios.get<InstagramUserProfile>(url, {
          params: { fields, access_token: candidate },
          timeout: 10000,
        });
        if (data && (data.name || data.username || data.profile_pic)) return data;
      } catch (err) {
        lastErr = err;
        // tenta o próximo endpoint
      }
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
  /** ID da Página do Facebook vinculada ao Instagram. Obrigatório quando o token é `EAA...` (Facebook Login for Business). */
  pageId?: string;
  accessToken: string;
  /** IGSID (Instagram-Scoped ID) do destinatário — o mesmo recebido no webhook em sender.id. NÃO é username nem ID público. */
  recipientId: string;
  text: string;
  /**
   * Quando true, envia com messaging_type MESSAGE_TAG e tag HUMAN_AGENT (só no caminho do Facebook).
   * Fora da janela de 24h só templates aprovados.
   */
  useHumanAgentTag?: boolean;
}

export interface InstagramSendMessageResponse {
  recipient_id: string;
  message_id: string;
}

export async function sendInstagramText(params: InstagramSendTextParams) {
  const token = sanitizeTokenForHeader(params.accessToken);
  const payload: Record<string, unknown> = {
    recipient: { id: params.recipientId },
    message: { text: params.text },
  };

  const post = async (url: string, bearer: string) => {
    const response = await axios.post<InstagramSendMessageResponse>(url, payload, {
      headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    console.log('Instagram message sent:', {
      recipientId: params.recipientId,
      messageId: response.data.message_id,
      via: url.includes('graph.instagram.com') ? 'instagram-login' : 'facebook-page',
    });
    return response.data;
  };

  try {
    // Caminho 1: Instagram Login (token IGA...) — o token identifica a conta, por isso o /me.
    if (isInstagramLoginToken(token)) {
      return await post(`${INSTAGRAM_GRAPH_BASE}/${INSTAGRAM_API_VERSION}/me/messages`, token);
    }

    // Caminho 2: Facebook Login for Business — exige o Page ID e um Page Access Token.
    if (!params.pageId) {
      throw new Error(
        'Canal Instagram sem "External ID". Com token do Facebook (EAA...) o envio precisa do ID da Página do Facebook vinculada ao Instagram.'
      );
    }
    if (params.useHumanAgentTag) {
      payload.messaging_type = 'MESSAGE_TAG';
      payload.tag = 'HUMAN_AGENT';
    }
    const url = `${FACEBOOK_GRAPH_BASE}/${GRAPH_API_VERSION}/${encodeURIComponent(params.pageId)}/messages`;

    try {
      return await post(url, token);
    } catch (err) {
      // Token de usuário do sistema: a Meta exige o Page Access Token. Deriva e tenta de novo.
      if (!needsPageAccessToken(err)) throw err;
      const pageToken = await resolvePageAccessToken(params.pageId, token);
      if (!pageToken) throw err;
      console.log('[Instagram send] Token de usuário do sistema trocado pelo Page Access Token.');
      return await post(url, pageToken);
    }
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    const data = axios.isAxiosError(err) ? err.response?.data : undefined;
    console.error('[Instagram send] Erro completo da API:', JSON.stringify({ status, data }));
    throw err;
  }
}
