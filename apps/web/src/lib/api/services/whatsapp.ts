import axios from 'axios';
import { sanitizeTokenForHeader } from '../utils';

/**
 * A API WhatsApp exige "to" como número só dígitos no formato esperado.
 * Contatos vindos da Guru podem vir com celular em 8 dígitos (ex.: 553194056541).
 * No Brasil o WhatsApp usa 9 dígitos (9 + 8): normaliza 12 dígitos (55+DDD+8) → 13 (55+DDD+9+8).
 */
function normalizeToPhone(to: string): string {
  let digits = (to || '').replace(/\D/g, '');
  if (!digits) return to || '';
  if (digits.startsWith('55') && digits.length === 12) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4);
  }
  if (digits.startsWith('55') && digits.length === 11) {
    digits = digits.slice(0, 4) + '9' + digits.slice(4);
  }
  return digits;
}

export interface WhatsAppSendTextParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}

export interface WhatsAppSendMessageResponse {
  messaging_product: string;
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

export async function sendWhatsAppText(params: WhatsAppSendTextParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) {
    throw new Error('Número do destinatário inválido (vazio após normalização).');
  }
  // Remove caracteres de controle que podem causar (#131009) Parameter value is not valid
  const bodyText = (params.text || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  const response = await axios.post<WhatsAppSendMessageResponse>(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: bodyText || ' ',
      },
    },
    {
      headers: {
        Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('WhatsApp message sent:', {
    phoneNumberId: params.phoneNumberId,
    to,
    messageId: response.data.messages[0]?.id,
  });

  return response.data;
}

export interface WhatsAppSendMediaParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  mediaUrl: string;
  caption?: string;
  filename?: string;
}

export async function sendWhatsAppImage(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) throw new Error('Número do destinatário inválido (vazio após normalização).');
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: params.mediaUrl, caption: params.caption || undefined },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppVideo(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) throw new Error('Número do destinatário inválido (vazio após normalização).');
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'video',
    video: { link: params.mediaUrl, caption: params.caption || undefined },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppAudio(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) throw new Error('Número do destinatário inválido (vazio após normalização).');
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'audio',
    audio: { link: params.mediaUrl },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppDocument(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const to = normalizeToPhone(params.to);
  if (!to) throw new Error('Número do destinatário inválido (vazio após normalização).');
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'document',
    document: {
      link: params.mediaUrl,
      caption: params.caption || undefined,
      filename: params.filename || 'documento',
    },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${sanitizeTokenForHeader(params.accessToken)}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}
