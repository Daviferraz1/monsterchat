import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { WhatsAppSendMessageResponse } from '../types/whatsapp.types.js';

export interface WhatsAppSendTextParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}

export interface WhatsAppSendMediaParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  mediaUrl: string;
  caption?: string;
  filename?: string;
}

/**
 * Envia mensagem de texto via WhatsApp Cloud API
 */
export async function sendWhatsAppText(params: WhatsAppSendTextParams) {
  try {
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

    logger.info('WhatsApp message sent', {
      phoneNumberId: params.phoneNumberId,
      to: params.to,
      messageId: response.data.messages[0]?.id,
    });

    return response.data;
  } catch (error: any) {
    logger.error('Error sending WhatsApp message', error, {
      phoneNumberId: params.phoneNumberId,
      to: params.to,
    });
    throw error;
  }
}

/**
 * Envia mídia via WhatsApp Cloud API
 */
export async function sendWhatsAppMedia(params: WhatsAppSendMediaParams) {
  try {
    const url = `https://graph.facebook.com/v21.0/${params.phoneNumberId}/messages`;
    
    const payload: any = {
      messaging_product: 'whatsapp',
      to: params.to,
      type: params.mediaType,
      [params.mediaType]: {
        link: params.mediaUrl,
      },
    };

    if (params.caption) {
      payload[params.mediaType].caption = params.caption;
    }

    if (params.filename && params.mediaType === 'document') {
      payload.document.filename = params.filename;
    }

    const response = await axios.post<WhatsAppSendMessageResponse>(
      url,
      payload,
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('WhatsApp media sent', {
      phoneNumberId: params.phoneNumberId,
      to: params.to,
      mediaType: params.mediaType,
      messageId: response.data.messages[0]?.id,
    });

    return response.data;
  } catch (error: any) {
    logger.error('Error sending WhatsApp media', error, {
      phoneNumberId: params.phoneNumberId,
      to: params.to,
      mediaType: params.mediaType,
    });
    throw error;
  }
}

/**
 * Baixa mídia do WhatsApp usando Graph API
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ url: string; mimeType: string; sha256: string }> {
  try {
    // Primeiro, obter a URL da mídia
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
  } catch (error: any) {
    logger.error('Error downloading WhatsApp media', error, {
      mediaId,
    });
    throw error;
  }
}
