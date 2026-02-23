export type ChannelType = 'whatsapp' | 'instagram';

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

export interface Conversation {
  id: string;
  channel_id: string;
  contact_id: string;
  status: ConversationStatus;
  assigned_to?: string;
  priority: string;
  subject?: string;
  tags: string[];
  unread_count: number;
  last_message_at?: string;
  last_message_preview?: string;
  last_agent_reply_at?: string;
  closed_at?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  contact?: Contact;
  channel?: Channel;
}

export interface Contact {
  id: string;
  channel_type: ChannelType;
  external_id: string;
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  profile_pic_url?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/** Dados do Digital Guru no metadata do contato (vendas processadas → identificar aluno e produtos). */
export interface DigitalGuruProduct {
  name: string;
  product_id?: string;
  order_id?: string;
  purchased_at?: string;
}

export interface DigitalGuruMetadata {
  is_student: boolean;
  customer_id?: string;
  products: DigitalGuruProduct[];
  situation?: string;
  last_sync_at?: string;
}

export interface Channel {
  id: string;
  type: ChannelType;
  name: string;
  external_id: string;
  business_account_id?: string;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender_type: SenderType;
  sender_id?: string;
  content_type: MessageContentType;
  body?: string;
  media_url?: string;
  media_mime_type?: string;
  media_filename?: string;
  media_size?: number;
  external_id?: string;
  status: MessageStatus;
  error_message?: string;
  reply_to_id?: string;
  metadata: Record<string, any>;
  created_at: string;
}
