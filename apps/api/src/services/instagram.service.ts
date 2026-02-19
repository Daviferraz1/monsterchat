import axios from 'axios';
import { logger } from '../utils/logger.js';
import type { InstagramSendMessageResponse } from '../types/instagram.types.js';

export interface InstagramSendTextParams {
  pageId: string;
  accessToken: string;
  recipientId: string;
  text: string;
}

export interface InstagramSendMediaParams {
  pageId: string;
  accessToken: string;
  recipientId: string;
  mediaType: 'image' | 'video' | 'audio' | 'file';
  mediaUrl: string;
}

/**
 * Envia mensagem de texto via Instagram Messaging API
 */
export async function sendInstagramText(params: InstagramSendTextParams) {
  try {
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

    logger.info('Instagram message sent', {
      pageId: params.pageId,
      recipientId: params.recipientId,
      messageId: response.data.message_id,
    });

    return response.data;
  } catch (error: any) {
    logger.error('Error sending Instagram message', error, {
      pageId: params.pageId,
      recipientId: params.recipientId,
    });
    throw error;
  }
}

/**
 * Envia mídia via Instagram Messaging API
 */
export async function sendInstagramMedia(params: InstagramSendMediaParams) {
  try {
    const url = `https://graph.facebook.com/v21.0/${params.pageId}/messages`;
    
    const response = await axios.post<InstagramSendMessageResponse>(
      url,
      {
        recipient: {
          id: params.recipientId,
        },
        message: {
          attachment: {
            type: params.mediaType,
            payload: {
              url: params.mediaUrl,
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('Instagram media sent', {
      pageId: params.pageId,
      recipientId: params.recipientId,
      mediaType: params.mediaType,
      messageId: response.data.message_id,
    });

    return response.data;
  } catch (error: any) {
    logger.error('Error sending Instagram media', error, {
      pageId: params.pageId,
      recipientId: params.recipientId,
      mediaType: params.mediaType,
    });
    throw error;
  }
}
