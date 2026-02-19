import axios from 'axios';

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
  
  const response = await axios.post<WhatsAppSendMessageResponse>(
    url,
    {
      messaging_product: 'whatsapp',
      to: params.to,
      type: 'text',
      text: {
        body: params.text,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  console.log('WhatsApp message sent:', {
    phoneNumberId: params.phoneNumberId,
    to: params.to,
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
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'image',
    image: { link: params.mediaUrl, caption: params.caption || undefined },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppVideo(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'video',
    video: { link: params.mediaUrl, caption: params.caption || undefined },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppAudio(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'audio',
    audio: { link: params.mediaUrl },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}

export async function sendWhatsAppDocument(params: WhatsAppSendMediaParams) {
  const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to: params.to,
    type: 'document',
    document: {
      link: params.mediaUrl,
      caption: params.caption || undefined,
      filename: params.filename || 'documento',
    },
  };
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data as WhatsAppSendMessageResponse;
}
