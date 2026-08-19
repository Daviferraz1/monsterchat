import { needsReply } from './conversationStatus';
import { priorityMeta } from './priority';
import type { ChannelType, Conversation, ConversationStatus, Task } from '@/types';

/**
 * Forma comum de um card do quadro.
 *
 * Conversa e tarefa continuam sendo entidades separadas no banco (ver migração
 * 043); esta normalização existe só para o card ser um componente só. Sem ela, a
 * tela vira dois desenhos parecidos que divergem na primeira mudança.
 */
export interface BoardItem {
  kind: 'conversation' | 'task';
  id: string;
  title: string;
  subtitle: string;
  status: ConversationStatus;
  priority: string;
  departmentId?: string | null;
  assignedTo?: string | null;
  assignedAt?: string | null;
  /** Só tarefa: prazo. */
  dueAt?: string | null;
  /** Só tarefa: limite acordado, em minutos. */
  slaMinutes?: number | null;
  /** Última movimentação — ordena o card dentro da raia. */
  activityAt?: string | null;
  /** Só conversa: aluno falou por último e ninguém respondeu. */
  needsReply: boolean;
  channelType?: ChannelType | null;
  /** Conversa vinculada (a própria, ou a de origem da tarefa). */
  conversationId?: string | null;
  contactId?: string | null;
  taskTypeId?: string | null;
  recurring: boolean;
  seenAt?: string | null;
}

export function fromConversation(conversation: Conversation): BoardItem {
  const contact = conversation.contact;
  const username = (contact?.metadata as { username?: string } | undefined)?.username;
  return {
    kind: 'conversation',
    id: conversation.id,
    title:
      contact?.name || contact?.phone || (username ? `@${username}` : '') || 'Contato sem nome',
    subtitle: conversation.last_message_preview?.trim() || 'Sem mensagens',
    status: conversation.status,
    priority: conversation.priority,
    departmentId: conversation.department_id,
    assignedTo: conversation.assigned_to ?? null,
    assignedAt: conversation.assigned_at ?? null,
    activityAt: conversation.last_message_at ?? null,
    needsReply: needsReply(conversation),
    channelType: conversation.channel?.type ?? null,
    conversationId: conversation.id,
    contactId: conversation.contact_id,
    recurring: false,
  };
}

export function fromTask(task: Task): BoardItem {
  return {
    kind: 'task',
    id: task.id,
    title: task.title,
    subtitle: task.description?.trim() || 'Sem descrição',
    status: task.status,
    priority: task.priority,
    departmentId: task.department_id,
    assignedTo: task.assigned_to ?? null,
    assignedAt: task.assigned_at ?? null,
    dueAt: task.due_at ?? null,
    slaMinutes: task.sla_minutes ?? null,
    activityAt: task.updated_at,
    needsReply: false,
    conversationId: task.conversation_id ?? null,
    contactId: task.contact_id ?? null,
    taskTypeId: task.task_type_id ?? null,
    recurring: !!task.recurrence_id,
    seenAt: task.first_seen_at ?? null,
  };
}

/** Urgente primeiro; depois o que vence antes; depois a movimentação mais recente. */
export function compareBoardItems(a: BoardItem, b: BoardItem): number {
  const byPriority = priorityMeta(a.priority).weight - priorityMeta(b.priority).weight;
  if (byPriority !== 0) return byPriority;

  // Item com prazo vence item sem prazo — prazo é compromisso, atividade é só ruído.
  if (a.dueAt && b.dueAt) {
    const byDue = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    if (byDue !== 0) return byDue;
  } else if (a.dueAt) return -1;
  else if (b.dueAt) return 1;

  return new Date(b.activityAt ?? 0).getTime() - new Date(a.activityAt ?? 0).getTime();
}

/** Atrasada = tem prazo, o prazo passou e não está concluída. */
export function isOverdue(item: BoardItem, now = Date.now()): boolean {
  if (!item.dueAt || item.status === 'closed') return false;
  return new Date(item.dueAt).getTime() < now;
}
