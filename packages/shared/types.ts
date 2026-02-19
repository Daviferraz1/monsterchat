// Tipos compartilhados entre frontend e backend
export type ChannelType = 'whatsapp' | 'instagram';

export type MessageDirection = 'inbound' | 'outbound';

export type ConversationStatus = 'open' | 'pending' | 'closed' | 'snoozed';

export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
