import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { invalidateStyleCache } from '@/lib/api/ia/operator-style';

export const dynamic = 'force-dynamic';

/** Lista as lições de estilo aprendidas (ativas e desativadas). */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('ia_style_lessons')
      .select('id, brand, trigger_context, lesson, hits, is_active, evidence, created_at, updated_at')
      .order('is_active', { ascending: false })
      .order('hits', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lessons: data ?? [] });
  } catch (err) {
    console.error('[API ia/style] GET', err);
    return NextResponse.json({ error: 'Falha ao listar lições' }, { status: 500 });
  }
}

/** Edita uma lição (texto, gatilho) ou ativa/desativa. */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.lesson === 'string' && body.lesson.trim()) patch.lesson = body.lesson.trim().slice(0, 200);
    if (typeof body.triggerContext === 'string' && body.triggerContext.trim()) {
      patch.trigger_context = body.triggerContext.trim().slice(0, 60);
    }
    if (typeof body.isActive === 'boolean') patch.is_active = body.isActive;
    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('ia_style_lessons').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidateStyleCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API ia/style] PATCH', err);
    return NextResponse.json({ error: 'Falha ao atualizar lição' }, { status: 500 });
  }
}

/** Remove a lição de vez (para desativar sem perder o histórico, use PATCH isActive=false). */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
    const { error } = await supabaseAdmin.from('ia_style_lessons').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidateStyleCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API ia/style] DELETE', err);
    return NextResponse.json({ error: 'Falha ao excluir lição' }, { status: 500 });
  }
}
