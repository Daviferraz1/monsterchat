import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { classifyOutcome } from '@/lib/api/ia/similarity';
import type { SuggestionOutcome } from '@/lib/api/ia/similarity';

export const dynamic = 'force-dynamic';

const JANELA_DIAS = 30;
const PAGINA = 1000;

/**
 * O que a equipe fez com as sugestões dos últimos 30 dias. `was_used` sozinho
 * subestima a IA (só conta o envio sem nenhuma edição), então classificamos
 * pela semelhança entre a sugestão e o que foi enviado.
 */
async function aproveitamento(): Promise<Record<SuggestionOutcome, number> & { total: number }> {
  const desde = new Date(Date.now() - JANELA_DIAS * 864e5).toISOString();
  const out = { total: 0, exata: 0, quase_igual: 0, parcial: 0, descartada: 0, sem_texto: 0 };
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabaseAdmin
      .from('response_suggestions')
      .select('was_used, suggested_response, edited_response')
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      out[classifyOutcome(row)]++;
      out.total++;
    }
    if (!data || data.length < PAGINA) break;
  }
  return out;
}

export async function GET() {
  try {
    const [
      { count: conversationsAnalyzed },
      { count: knowledgeEntries },
      { data: brandSummary },
      suggestions,
    ] = await Promise.all([
      supabaseAdmin.from('conversation_analysis').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('knowledge_base').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabaseAdmin.from('v_brand_summary').select('*').limit(10),
      aproveitamento().catch((err) => {
        console.error('[API ia/stats] aproveitamento', err);
        return null;
      }),
    ]);

    return NextResponse.json({
      conversationsAnalyzed: conversationsAnalyzed ?? 0,
      knowledgeEntries: knowledgeEntries ?? 0,
      byBrand: brandSummary ?? [],
      suggestions,
    });
  } catch (err) {
    console.error('[API ia/stats]', err);
    return NextResponse.json({
      conversationsAnalyzed: 0,
      knowledgeEntries: 0,
      byBrand: [],
      suggestions: null,
    });
  }
}
