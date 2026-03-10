import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(50, Math.max(10, parseInt(searchParams.get('pageSize') ?? '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const brand = searchParams.get('brand') || '';
    const category = searchParams.get('category') || '';

    let q = supabaseAdmin
      .from('knowledge_base')
      .select('id, brand, category, question_pattern, gold_response, frequency, is_active, tags, updated_at', { count: 'exact' })
      .eq('is_active', true)
      .order('frequency', { ascending: false })
      .order('updated_at', { ascending: false });

    if (brand) q = q.eq('brand', brand);
    if (category) q = q.eq('category', category);
    if (search) {
      q = q.or(`question_pattern.ilike.%${search}%,gold_response.ilike.%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await q.range(from, from + pageSize - 1);

    if (error) {
      // Tabela pode não existir ainda (migração não rodada)
      console.warn('[API ia/knowledge-base]', error.message);
      return NextResponse.json({ items: [], total: 0, page: 1, pageSize });
    }

    return NextResponse.json({
      items: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    console.error('[API ia/knowledge-base]', err);
    return NextResponse.json({ items: [], total: 0, page: 1, pageSize: 20 });
  }
}
