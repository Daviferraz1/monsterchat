/**
 * Busca na base de conhecimento (compartilhada entre a sugestão e o agente).
 * Semântica primeiro (embeddings + pgvector), com fallback para full-text.
 */
import { supabaseAdmin } from '../supabase';
import { embedText, isEmbeddingsEnabled } from './embeddings';

export type KbRow = {
  id: string;
  brand: string;
  category: string;
  question_pattern: string;
  gold_response: string;
  frequency: number;
  similarity: number;
};

export interface KnowledgeSearchResult {
  rows: KbRow[];
  /** true = veio da busca semântica (similaridade de cosseno); false = full-text (ts_rank). */
  semantic: boolean;
}

export function isHumanKnowledgeBrand(brand?: string): boolean {
  if (!brand) return false;
  const normalized = brand.trim().toLowerCase();
  return normalized === 'human' || normalized === 'humano' || normalized === 'both';
}

/** Prioriza marca "humana", depois maior similaridade, depois maior frequência. */
export function rankKbRows(rows: KbRow[]): KbRow[] {
  return [...rows].sort((a, b) => {
    const aHuman = isHumanKnowledgeBrand(a.brand);
    const bHuman = isHumanKnowledgeBrand(b.brand);
    if (aHuman !== bHuman) return aHuman ? -1 : 1;
    if (a.similarity !== b.similarity) return b.similarity - a.similarity;
    return b.frequency - a.frequency;
  });
}

export async function searchKnowledge(
  query: string,
  brand?: string
): Promise<KnowledgeSearchResult> {
  if (!query?.trim()) return { rows: [], semantic: false };

  // 1) Semântica (embeddings + match_knowledge_base)
  if (isEmbeddingsEnabled()) {
    const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY');
    if (queryEmbedding) {
      try {
        const { data, error } = await supabaseAdmin.rpc('match_knowledge_base', {
          query_embedding: queryEmbedding,
          search_brand: brand ?? null,
          match_count: 3,
          min_similarity: 0.55,
        });
        if (!error && data?.length) {
          return { rows: rankKbRows(data as KbRow[]), semantic: true };
        }
      } catch {
        // cai no full-text
      }
    }
  }

  // 2) Fallback full-text (palavra-chave)
  try {
    const { data, error } = await supabaseAdmin.rpc('search_knowledge_base', {
      search_text: query,
      search_brand: brand ?? null,
      max_results: 3,
    });
    if (!error && data?.length) {
      return { rows: rankKbRows(data as KbRow[]), semantic: false };
    }
  } catch {
    // sem resultados
  }

  return { rows: [], semantic: false };
}
