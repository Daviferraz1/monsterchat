/**
 * Tipos para payloads do Instagram Messaging API
 */

export interface InstagramWebhookEntry {
  id: string;
  time: number;
  messaging: InstagramMessaging[];
}

export interface InstagramMessaging {
  sender: {
    id: string;
  };
  recipient: {
    id: string;
  };
  timestamp: number;
  message?: InstagramMessage;
  message_reads?: InstagramMessageRead[];
  reaction?: InstagramReaction;
  postback?: InstagramPostback;
}

export interface InstagramMessage {
  mid: string;
  text?: string;
  attachments?: InstagramAttachment[];
  reply_to?: {
    mid: string;
  };
  is_echo?: boolean;
}

export interface InstagramAttachment {
  type: 'image' | 'video' | 'audio' | 'file';
  payload: {
    url: string;
    sticker_id?: number;
  };
}

export interface InstagramMessageRead {
  watermark: number;
}

export interface InstagramReaction {
  mid: string;
  action: 'react' | 'unreact';
  reaction: string;
  emoji: string;
}

export interface InstagramPostback {
  title: string;
  payload: string;
  referral?: any;
}

export interface InstagramSendMessageResponse {
  recipient_id: string;
  message_id: string;
}
