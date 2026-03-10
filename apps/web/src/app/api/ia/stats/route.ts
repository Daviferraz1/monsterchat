import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      { count: conversationsAnalyzed },
      { count: knowledgeEntries },
      { data: brandSummary },
    ] = await Promise.all([
      supabaseAdmin.from('conversation_analysis').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('knowledge_base').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabaseAdmin.from('v_brand_summary').select('*').limit(10),
    ]);

    return NextResponse.json({
      conversationsAnalyzed: conversationsAnalyzed ?? 0,
      knowledgeEntries: knowledgeEntries ?? 0,
      byBrand: brandSummary ?? [],
    });
  } catch (err) {
    console.error('[API ia/stats]', err);
    return NextResponse.json({
      conversationsAnalyzed: 0,
      knowledgeEntries: 0,
      byBrand: [],
    });
  }
}
