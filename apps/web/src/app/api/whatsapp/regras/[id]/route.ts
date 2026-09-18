import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { requireManager } from '../../../instagram/comment-rules/_shared';
import { lerRegraWhatsapp } from '../_shared';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireManager();
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const lido = lerRegraWhatsapp(body, true);
  if ('erro' in lido) return NextResponse.json({ error: lido.erro }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('whatsapp_regras_automaticas')
    .update({ ...lido.campos, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regra: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireManager();
  if (guard.error) return guard.error;
  const { id } = await params;
  const { error } = await supabaseAdmin.from('whatsapp_regras_automaticas').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
