import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { embedBatch, isEmbeddingsEnabled } from '@/lib/api/ia/embeddings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK = 8; // textos por chamada ao Gemini (lotes pequenos evitam 429; com billing pode subir)
const DELAY_MS = 700; // pausa entre chamadas

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Gera embeddings para as entradas da base que ainda não têm.
 * Processa em lotes pequenos com pausa; ao bater no limite do Gemini (429),
 * para e devolve rateLimited:true (basta chamar de novo mais tarde — é resumível).
 */
export async function POST(request: NextRequest) {
  if (!isEmbeddingsEnabled()) {
    return NextResponse.json({ error: 'GEMINI_API_KEY não configurada no ambiente.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body.batchSize) || 20, 1), 100);

  const { data: rows, error } = await supabaseAdmin
    .from('knowledge_base')
    .select('id, question_pattern, question_variations')
    .eq('is_active', true)
    .is('embedding', null)
    .limit(batchSize);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) {
    return NextResponse.json({ processed: 0, remaining: 0, done: true, rateLimited: false });
  }

  const textOf = (r: { question_pattern: string; question_variations: unknown }) => {
    const variations = Array.isArray(r.question_variations)
      ? r.question_variations.filter((v) => typeof v === 'string').join(' ')
      : '';
    return [r.question_pattern, variations].filter(Boolean).join(' ').slice(0, 8000);
  };

  let processed = 0;
  let rateLimited = false;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { embeddings, status } = await embedBatch(chunk.map(textOf), 'RETRIEVAL_DOCUMENT');

    if (status === 429) {
      rateLimited = true;
      break;
    }

    for (let j = 0; j < chunk.length; j++) {
      const emb = embeddings[j];
      if (!emb) continue;
      const { error: upErr } = await supabaseAdmin
        .from('knowledge_base')
        .update({ embedding: emb })
        .eq('id', chunk[j].id);
      if (!upErr) processed++;
    }

    if (i + CHUNK < rows.length) await sleep(DELAY_MS);
  }

  const { count } = await supabaseAdmin
    .from('knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .is('embedding', null);

  const remaining = count ?? 0;
  return NextResponse.json({ processed, remaining, done: remaining === 0, rateLimited });
}
