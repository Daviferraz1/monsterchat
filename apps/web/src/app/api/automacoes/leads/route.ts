import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext } from '@/lib/api/team';
import { listInstagramMedia, type InstagramMediaResumo } from '@/lib/api/services/instagram';

export const dynamic = 'force-dynamic';

/** Capas dos posts: uma chamada à Meta a cada 10 minutos basta para a página. */
let cachePosts: { em: number; mapa: Record<string, Pick<InstagramMediaResumo, 'permalink' | 'thumbnail_url' | 'media_url' | 'media_type'>> } | null = null;

async function capas(): Promise<NonNullable<typeof cachePosts>['mapa']> {
  if (cachePosts && Date.now() - cachePosts.em < 10 * 60_000) return cachePosts.mapa;
  const { data: canal } = await supabaseAdmin
    .from('channels')
    .select('access_token')
    .eq('type', 'instagram')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  const mapa: NonNullable<typeof cachePosts>['mapa'] = {};
  if (canal?.access_token) {
    try {
      for (const p of await listInstagramMedia(canal.access_token, 50)) {
        mapa[p.id] = { permalink: p.permalink, thumbnail_url: p.thumbnail_url, media_url: p.media_url, media_type: p.media_type };
      }
    } catch (err) {
      console.warn('[API automacoes/leads] Sem capas dos posts:', err);
    }
  }
  cachePosts = { em: Date.now(), mapa };
  return mapa;
}

/**
 * Leads que chegaram pela automação de comentários.
 * ?dias=7|30|90  ?situacao=todos|aguardando|responderam|falhas
 */
export async function GET(request: NextRequest) {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const dias = Math.min(90, Math.max(1, Number(sp.get('dias')) || 7));
  const situacao = sp.get('situacao') ?? 'todos';
  const desde = new Date(Date.now() - dias * 86400000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('instagram_comment_replies')
    .select(
      `id, comment_id, username, comment_text, palavra, status, error, media_id, created_at, conversation_id,
       regra:instagram_comment_rules(nome),
       contato:contacts(name, profile_pic_url),
       conversa:conversations(automacao_pendente, status, last_message_at, last_message_preview)`
    )
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Linha = { status: string; conversa: { automacao_pendente: boolean } | null };
  const todas = (data ?? []) as unknown as Linha[];
  const eh = {
    aguardando: (l: Linha) => l.status === 'sent' && Boolean(l.conversa?.automacao_pendente),
    responderam: (l: Linha) => l.status === 'sent' && l.conversa != null && !l.conversa.automacao_pendente,
    falhas: (l: Linha) => l.status !== 'sent',
  };
  const contagem = {
    todos: todas.length,
    aguardando: todas.filter(eh.aguardando).length,
    responderam: todas.filter(eh.responderam).length,
    falhas: todas.filter(eh.falhas).length,
  };
  const filtro = eh[situacao as keyof typeof eh];
  const leads = filtro ? todas.filter(filtro) : todas;

  return NextResponse.json({ leads, contagem, posts: await capas() });
}
