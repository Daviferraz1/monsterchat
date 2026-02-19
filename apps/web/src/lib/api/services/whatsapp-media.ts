import axios from 'axios';

/**
 * Baixa informações da mídia do WhatsApp usando Graph API
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ url: string; mimeType: string; sha256: string }> {
  const url = `https://graph.facebook.com/v21.0/${mediaId}`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      access_token: accessToken,
    },
  });

  return {
    url: response.data.url,
    mimeType: response.data.mime_type,
    sha256: response.data.sha256,
  };
}
