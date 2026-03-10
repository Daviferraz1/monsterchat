import { supabaseAdmin } from '../supabase';

export interface FeedbackParams {
  conversationId: string;
  knowledgeEntryId?: string;
  suggestedResponse: string;
  confidence: number;
  wasUsed: boolean;
  wasEdited?: boolean;
  editedResponse?: string;
  operatorFeedback?: string;
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
}
