import { supabaseAdmin } from '../supabase';

function similarityToConfidence(similarity: number): 'high' | 'medium' | 'low' | 'none' {
  if (similarity >= 0.5) return 'high';
  if (similarity >= 0.2) return 'medium';
  if (similarity > 0) return 'low';
  return 'none';
}

export interface SuggestionResult {
  confidence: 'high' | 'medium' | 'low' | 'none';
  suggestion: string | null;
  category: string | null;
  alternatives: Array<{ question_pattern: string; gold_response: string; frequency: number; similarity: number }>;
}

/**
 * Busca sugestão na base de conhecimento (PostgreSQL, sem IA).
 */
export async function getSuggestion(
  messageBody: string,
  brand?: string
): Promise<SuggestionResult> {
  if (!messageBody?.trim()) {
    return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('search_knowledge_base', {
      search_text: messageBody,
      search_brand: brand ?? null,
      max_results: 3,
    });

    if (error || !data?.length) {
      return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
    }

    const results = data as Array<{
      id: string;
      brand: string;
      category: string;
      question_pattern: string;
      gold_response: string;
      frequency: number;
      similarity: number;
    }>;

    const top = results[0];
    const confidence = similarityToConfidence(top.similarity);

    return {
      confidence,
      suggestion: top.gold_response,
      category: top.category,
      alternatives: results.slice(1).map((r) => ({
        question_pattern: r.question_pattern,
        gold_response: r.gold_response,
        frequency: r.frequency,
        similarity: r.similarity,
      })),
    };
  } catch (err) {
    console.error('[IA getSuggestion]', err);
    return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
  }
}
