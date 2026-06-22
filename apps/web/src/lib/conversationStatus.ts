import type { Conversation } from '@/types';

type ConvStatusFields = Pick<Conversation, 'status' | 'closed_at' | 'last_message_at' | 'last_agent_reply_at'>;

/**
 * Conversa finalizada pelo atendente E sem mensagem nova depois do fechamento.
 * Se o aluno mandar algo novo após finalizar, deixa de ser considerada finalizada
 * (volta a precisar de resposta).
 */
export function isFinalized(c: Pick<Conversation, 'status' | 'closed_at' | 'last_message_at'>): boolean {
  if (c.status !== 'closed') return false;
  if (c.last_message_at && c.closed_at) return c.closed_at >= c.last_message_at;
  return true;
}

/**
 * Precisa de resposta = a última mensagem foi do contato (inbound) e ainda não foi
 * respondida, e a conversa não está finalizada. (Inbound quando não há resposta do
 * atendente, ou a última mensagem é mais recente que a última resposta.)
 */
export function needsReply(c: ConvStatusFields): boolean {
  if (isFinalized(c)) return false;
  if (!c.last_agent_reply_at) return !!c.last_message_at;
  return !!c.last_message_at && c.last_message_at > c.last_agent_reply_at;
}
