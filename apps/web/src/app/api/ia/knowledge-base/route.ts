import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

const BRANDS = ['monster', 'fagenius', 'both'] as const;
const CATEGORIES = ['financeiro', 'acesso', 'matricula', 'academico', 'lead', 'tecnico', 'duvida', 'reclamacao', 'documento', 'outro'] as const;

function parseBody<T>(body: unknown, schema: Record<string, (v: unknown) => T[keyof T] | undefined>): Partial<T> | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, fn] of Object.entries(schema)) {
    const v = fn(o[key]);
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length ? (out as Partial<T>) : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(50, Math.max(10, parseInt(searchParams.get('pageSize') ?? '20', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const brand = searchParams.get('brand') || '';
    const category = searchParams.get('category') || '';
    const includeInactive = searchParams.get('includeInactive') === 'true';

    let q = supabaseAdmin
      .from('knowledge_base')
      .select('id, brand, category, question_pattern, gold_response, frequency, is_active, tags, updated_at', { count: 'exact' })
      .order('frequency', { ascending: false })
      .order('updated_at', { ascending: false });

    if (!includeInactive) q = q.eq('is_active', true);
    if (brand) q = q.eq('brand', brand);
    if (category) q = q.eq('category', category);
    if (search) {
      q = q.or(`question_pattern.ilike.%${search}%,gold_response.ilike.%${search}%`);
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await q.range(from, from + pageSize - 1);

    if (error) {
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

/** Criar nova entrada na base de conhecimento */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const schema = {
      brand: (v: unknown) => (typeof v === 'string' && BRANDS.includes(v as (typeof BRANDS)[number]) ? v : 'both'),
      category: (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
      question_pattern: (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
      gold_response: (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined),
      frequency: (v: unknown) => (typeof v === 'number' && v >= 0 ? v : typeof v === 'string' ? parseInt(v, 10) : 1),
      is_active: (v: unknown) => (typeof v === 'boolean' ? v : true),
      tags: (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : undefined),
    };
    const parsed = parseBody(body, schema);
    if (!parsed?.question_pattern || !parsed?.gold_response) {
      return NextResponse.json({ error: 'question_pattern e gold_response são obrigatórios' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('knowledge_base')
      .insert({
        brand: parsed.brand ?? 'both',
        category: parsed.category ?? 'outro',
        question_pattern: parsed.question_pattern,
        gold_response: parsed.gold_response,
        frequency: parsed.frequency ?? 1,
        is_active: parsed.is_active ?? true,
        tags: parsed.tags ?? [],
      })
      .select('id, brand, category, question_pattern, gold_response, frequency, is_active, tags, updated_at')
      .single();

    if (error) {
      console.warn('[API ia/knowledge-base POST]', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API ia/knowledge-base POST]', err);
    return NextResponse.json({ error: 'Erro ao criar entrada' }, { status: 500 });
  }
}
