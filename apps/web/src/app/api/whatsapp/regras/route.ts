import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { requireManager } from '../../instagram/comment-rules/_shared';
import { lerRegraWhatsapp } from './_shared';

export const dynamic = 'force-dynamic';

/** Regras + quantos contatos cada uma atendeu nos últimos 30 dias. */
export async function GET() {
  const guard = await requireManager();
  if (guard.error) return guard.error;

  const [{ data: regras, error }, { data: canais }, { data: envios }] = await Promise.all([
    supabaseAdmin.from('whatsapp_regras_automaticas').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('channels').select('id, name').eq('type', 'whatsapp').eq('is_active', true),
    supabaseAdmin
      .from('whatsapp_regra_envios')
      .select('rule_id')
      .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const atendidos = new Map<string, number>();
  for (const e of envios ?? []) atendidos.set(e.rule_id, (atendidos.get(e.rule_id) ?? 0) + 1);

  return NextResponse.json({
    canais: canais ?? [],
    regras: (regras ?? []).map((r) => ({ ...r, atendidos_30d: atendidos.get(r.id) ?? 0 })),
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireManager();
  if (guard.error) return guard.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const lido = lerRegraWhatsapp(body);
  if ('erro' in lido) return NextResponse.json({ error: lido.erro }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('whatsapp_regras_automaticas')
    .insert({ ...lido.campos, created_by: guard.ctx.userId ?? null })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regra: data });
}
