/**
 * Embeddings para busca semântica na base de conhecimento (Fase 1 da IA).
 * Usa o Gemini (gemini-embedding-001) via REST — não precisa de SDK.
 * Dimensão 1536 (MRL), vetores normalizados para uso com similaridade de cosseno.
 *
 * Se GEMINI_API_KEY não estiver configurada, todas as funções retornam null e
 * o sistema cai no fallback de busca por palavra-chave (search_knowledge_base).
 */
import { apiEnv } from '../env';

export const EMBEDDING_DIM = 1536;
const MODEL = 'gemini-embedding-001';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type EmbedTaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY';

/** True quando há chave do Gemini configurada (habilita a busca semântica). */
export function isEmbeddingsEnabled(): boolean {
  return !!apiEnv.GEMINI_API_KEY;
}

/** Normaliza o vetor para norma 1 (cosseno estável; o Gemini só normaliza em dim 3072). */
function normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (!norm || !isFinite(norm)) return v;
  return v.map((x) => x / norm);
}

async function postJson(
  url: string,
  body: unknown,
  timeoutMs: number
): Promise<{ status: number; json: any | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status !== 429) console.error('[IA embeddings] HTTP', res.status, text.slice(0, 200));
      return { status: res.status, json: null };
    }
    return { status: res.status, json: await res.json() };
  } catch (err) {
    console.error('[IA embeddings] fetch', err);
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Gera o embedding de um texto. Use RETRIEVAL_QUERY para a pergunta e RETRIEVAL_DOCUMENT ao indexar. */
export async function embedText(
  text: string,
  taskType: EmbedTaskType = 'RETRIEVAL_QUERY'
): Promise<number[] | null> {
  const key = apiEnv.GEMINI_API_KEY;
  if (!key || !text?.trim()) return null;
  const { json } = await postJson(
    `${BASE}/${MODEL}:embedContent?key=${key}`,
    {
      model: `models/${MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
      taskType,
      outputDimensionality: EMBEDDING_DIM,
    },
    10000
  );
  const values = json?.embedding?.values;
  if (!Array.isArray(values) || values.length === 0) return null;
  return normalize(values as number[]);
}

export interface BatchEmbedResult {
  embeddings: (number[] | null)[];
  /** Status HTTP da chamada (429 = limite do Gemini atingido). */
  status: number;
}

/**
 * Gera embeddings de um pequeno lote (para backfill). Mantém a ordem.
 * Lotes pequenos evitam estourar a cota do plano grátis (429). O chamador deve
 * verificar `status === 429` para parar e tentar mais tarde.
 */
export async function embedBatch(
  texts: string[],
  taskType: EmbedTaskType = 'RETRIEVAL_DOCUMENT'
): Promise<BatchEmbedResult> {
  const key = apiEnv.GEMINI_API_KEY;
  if (!key || texts.length === 0) return { embeddings: texts.map(() => null), status: 0 };
  const { status, json } = await postJson(
    `${BASE}/${MODEL}:batchEmbedContents?key=${key}`,
    {
      requests: texts.map((t) => ({
        model: `models/${MODEL}`,
        content: { parts: [{ text: (t ?? '').slice(0, 8000) }] },
        taskType,
        outputDimensionality: EMBEDDING_DIM,
      })),
    },
    20000
  );
  const embeddings = json?.embeddings;
  if (!Array.isArray(embeddings)) return { embeddings: texts.map(() => null), status };
  return {
    embeddings: embeddings.map((e: any) => {
      const values = e?.values;
      return Array.isArray(values) && values.length ? normalize(values as number[]) : null;
    }),
    status,
  };
}
