export type ChannelType = 'whatsapp' | 'instagram' | 'whatsapp_baileys';

export type MessageDirection = 'inbound' | 'outbound';

export type SenderType = 'contact' | 'agent' | 'system' | 'bot';

export type MessageContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact_card'
  | 'story_mention'
  | 'story_reply'
  | 'template'
  | 'interactive'
  | 'reaction';

export type ConversationStatus = 'open' | 'pending' | 'closed' | 'snoozed';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Mensagem unificada normalizada para ambos os canais
 */
export interface UnifiedInboundMessage {
  channelType: ChannelType;
  channelId: string;
  contactExternalId: string;
  contactName?: string;
  contactProfilePic?: string;
  messageExternalId: string;
  contentType: MessageContentType;
  body?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaSize?: number;
  replyToExternalId?: string;
  timestamp: string;
  rawPayload: Record<string, any>;
}
