import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { listInstagramMedia } from '@/lib/api/services/instagram';
import { lerRegra, requireManager } from './_shared';

export const dynamic = 'force-dynamic';

/** Regras + números dos últimos 30 dias + posts recentes para escolher. */
export async function GET() {
  const guard = await requireManager();
  if (guard.error) return guard.error;

  const { data: canais } = await supabaseAdmin
    .from('channels')
    .select('id, name, access_token')
    .eq('type', 'instagram')
    .eq('is_active', true);
  const { data: regras, error } = await supabaseAdmin
    .from('instagram_comment_rules')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: respostas } = await supabaseAdmin
    .from('instagram_comment_replies')
    .select('rule_id, status')
    .gte('created_at', desde);
  const stats = new Map<string, { enviados: number; falhas: number }>();
  for (const r of respostas ?? []) {
    if (!r.rule_id) continue;
    const s = stats.get(r.rule_id) ?? { enviados: 0, falhas: 0 };
    if (r.status === 'sent') s.enviados++;
    else s.falhas++;
    stats.set(r.rule_id, s);
  }

  let posts: Awaited<ReturnType<typeof listInstagramMedia>> = [];
  const canal = canais?.[0];
  if (canal?.access_token) {
    try {
      posts = await listInstagramMedia(canal.access_token, 30);
    } catch (err) {
      console.warn('[API comment-rules] Não listei os posts:', err);
    }
  }

  return NextResponse.json({
    canais: (canais ?? []).map((c) => ({ id: c.id, name: c.name })),
    regras: (regras ?? []).map((r) => ({ ...r, ...(stats.get(r.id) ?? { enviados: 0, falhas: 0 }) })),
    posts,
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireManager();
  if (guard.error) return guard.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const lido = lerRegra(body);
  if ('erro' in lido) return NextResponse.json({ error: lido.erro }, { status: 400 });

  let channelId = lido.campos.channel_id as string | undefined;
  if (!channelId) {
    const { data: canal } = await supabaseAdmin
      .from('channels')
      .select('id')
      .eq('type', 'instagram')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    channelId = canal?.id;
  }
  if (!channelId) return NextResponse.json({ error: 'Nenhum canal de Instagram ativo.' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('instagram_comment_rules')
    .insert({ ...lido.campos, channel_id: channelId, created_by: guard.ctx.userId })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ regra: data });
}
