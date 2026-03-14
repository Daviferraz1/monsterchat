import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

const BRANDS = ['monster', 'fagenius', 'both'] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.brand === 'string' && BRANDS.includes(body.brand as (typeof BRANDS)[number]))
      updates.brand = body.brand;
    if (typeof body.category === 'string' && body.category.trim()) updates.category = body.category.trim();
    if (typeof body.question_pattern === 'string' && body.question_pattern.trim())
      updates.question_pattern = body.question_pattern.trim();
    if (typeof body.gold_response === 'string' && body.gold_response.trim())
      updates.gold_response = body.gold_response.trim();
    if (typeof body.frequency === 'number' && body.frequency >= 0) updates.frequency = body.frequency;
    if (typeof body.frequency === 'string') {
      const n = parseInt(body.frequency, 10);
      if (!Number.isNaN(n) && n >= 0) updates.frequency = n;
    }
    if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
    if (Array.isArray(body.tags)) updates.tags = body.tags.filter((t: unknown) => typeof t === 'string');

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('knowledge_base')
      .update(updates)
      .eq('id', id)
      .select('id, brand, category, question_pattern, gold_response, frequency, is_active, tags, updated_at')
      .single();

    if (error) {
      console.warn('[API ia/knowledge-base/:id PATCH]', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API ia/knowledge-base/:id PATCH]', err);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

/** Exclusão lógica (is_active = false) para preservar referências em response_suggestions */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from('knowledge_base')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      console.warn('[API ia/knowledge-base/:id DELETE]', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (!data) return NextResponse.json({ error: 'Entrada não encontrada' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API ia/knowledge-base/:id DELETE]', err);
    return NextResponse.json({ error: 'Erro ao excluir' }, { status: 500 });
  }
}
