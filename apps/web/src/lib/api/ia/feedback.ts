import { supabaseAdmin } from '../supabase';
import { learnFromFeedback } from './learn-from-feedback';
import { learnOperatorStyle } from './operator-style';

export interface FeedbackParams {
  conversationId: string;
  knowledgeEntryId?: string;
  suggestedResponse: string;
  confidence: number;
  wasUsed: boolean;
  wasEdited?: boolean;
  editedResponse?: string;
  operatorFeedback?: string;
  /** Pergunta/dúvida do aluno (contexto usado na sugestão). Se não enviado, buscamos a última mensagem inbound da conversa. */
  questionContext?: string;
  brand?: 'monster' | 'fagenius' | 'both';
}

export async function recordSuggestionFeedback(params: FeedbackParams): Promise<void> {
  try {
    await supabaseAdmin.from('response_suggestions').insert({
      conversation_id: params.conversationId,
      knowledge_entry_id: params.knowledgeEntryId ?? null,
      suggested_response: params.suggestedResponse,
      confidence: params.confidence,
      was_used: params.wasUsed,
      was_edited: params.wasEdited ?? false,
      edited_response: params.editedResponse ?? null,
      operator_feedback: params.operatorFeedback ?? null,
    });
  } catch (err) {
    console.error('[IA recordSuggestionFeedback]', err);
  }

  // Quando o atendente NÃO usou a sugestão (ou editou), aprendemos com a resposta dele e criamos entrada na base de conhecimento
  const actualResponse = params.editedResponse?.trim();
  if (!actualResponse || (params.wasUsed && !params.wasEdited)) return;

  let questionContext = params.questionContext?.trim();
  if (!questionContext) {
    const { data: messages } = await supabaseAdmin
      .from('messages')
      .select('body')
      .eq('conversation_id', params.conversationId)
      .eq('direction', 'inbound')
      .eq('content_type', 'text')
      .not('body', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    const bodies = (messages ?? []).map((m: { body: string }) => m.body?.trim()).filter(Boolean).reverse();
    questionContext = bodies.join('\n') || '';
  }
  if (!questionContext) return;

  // Duas aprendizagens complementares a partir da mesma divergência:
  // 1) CONTEÚDO -> entrada na base de conhecimento (o que responder);
  // 2) FORMA    -> lição de estilo (como o atendente responde), que entra no prompt do agente.
  await Promise.all([
    learnFromFeedback({
      questionContext,
      actualResponse,
      brand: params.brand ?? 'both',
    }),
    learnOperatorStyle({
      suggestedResponse: params.suggestedResponse ?? '',
      actualResponse,
      questionContext,
      brand: params.brand ?? 'both',
    }),
  ]);
}
