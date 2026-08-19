export type ChannelType = 'whatsapp' | 'instagram' | 'guru' | 'whatsapp_baileys';

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
  /** Departamento responsável (sectors.id). null = ainda não triada. */
  department_id?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
  /** Primeira resposta humana — base do tempo de primeira resposta. */
  first_response_at?: string | null;
  /** 'low' | 'normal' | 'high' | 'urgent' — ver lib/priority.ts */
  priority: string;
  subject?: string;
  tags: string[];
  unread_count: number;
  last_message_at?: string;
  last_message_preview?: string;
  last_agent_reply_at?: string;
  closed_at?: string | null;
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

/** Origem da campanha (Facebook Ads, Instagram etc.) — salvo em contact.metadata.campaign */
export interface LeadCampaign {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** Quando a origem foi atribuída (ISO string) */
  attributed_at?: string;
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
  /** Operador que enviou (outbound/agent). */
  agent_user_id?: string | null;
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

/** Recado interno da equipe preso a uma conversa (thread do card no Quadro). */
export interface InternalNote {
  id: string;
  conversation_id: string;
  /** null = nota gerada pelo sistema/IA. */
  author_id?: string | null;
  body: string;
  media_url?: string | null;
  /** Anexo privado (bucket `internas`) — abrir sempre por /api/internal-files. */
  media_path?: string | null;
  media_mime_type?: string | null;
  media_filename?: string | null;
  media_size?: number | null;
  created_at: string;
}

/** Tipo de tarefa — configurável em tela (não é enum no código). */
export interface TaskType {
  id: string;
  name: string;
  description?: string | null;
  default_department_id?: string | null;
  /** Limite padrão para resolver, em minutos. */
  default_sla_minutes?: number | null;
  color: string;
  sort_order: number;
  active: boolean;
}

/**
 * Tarefa interna da equipe. Compartilha status e prioridade com a conversa
 * porque as duas aparecem no mesmo quadro, nas mesmas raias.
 */
export interface Task {
  id: string;
  title: string;
  description?: string | null;
  task_type_id?: string | null;
  department_id?: string | null;
  created_by?: string | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
  /** Aluno que originou a demanda (opcional). */
  contact_id?: string | null;
  /** Conversa de origem (opcional). */
  conversation_id?: string | null;
  status: ConversationStatus;
  priority: string;
  due_at?: string | null;
  /** Limite acordado na criação, em minutos (ver migração 044). */
  sla_minutes?: number | null;
  first_seen_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  recurrence_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export interface TaskRecurrence {
  id: string;
  title: string;
  description?: string | null;
  task_type_id?: string | null;
  department_id?: string | null;
  assigned_to?: string | null;
  priority: string;
  frequency: RecurrenceFrequency;
  interval_count: number;
  day_of_week?: number | null;
  day_of_month?: number | null;
  /** Dias de antecedência com que a tarefa aparece no quadro. */
  lead_days: number;
  next_due_at: string;
  last_created_at?: string | null;
  active: boolean;
  created_by?: string | null;
}
