import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext } from '@/lib/api/team';
import { gravarConfigPiloto, lerConfigPiloto, type PilotoConfig } from '@/lib/api/ia/piloto';

export const dynamic = 'force-dynamic';

/**
 * GET  → configuração do piloto, resumo de 7 dias e as últimas decisões.
 * POST { modo?, horario?, espera_seg?, max_seguidas?, janela_min? } → grava (gestor/supervisor).
 */
export async function GET() {
  try {
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
    const [config, { data: logs, error }] = await Promise.all([
      lerConfigPiloto(),
      supabaseAdmin
        .from('ia_piloto_log')
        .select('id, conversation_id, modo, decisao, assunto, motivo, texto, created_at, conversation:conversations(contact:contacts(name))')
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    const resumo: Record<string, number> = { enviou: 0, enviaria: 0, equipe: 0, nada: 0 };
    for (const l of logs ?? []) resumo[l.decisao] = (resumo[l.decisao] ?? 0) + 1;
    return NextResponse.json({
      ok: true,
      config,
      tabelaExiste: !error,
      resumo,
      ultimas: (logs ?? []).slice(0, 40).map((l) => ({
        id: l.id,
        conversationId: l.conversation_id,
        nome: (l.conversation as { contact?: { name?: string } } | null)?.contact?.name ?? null,
        modo: l.modo,
        decisao: l.decisao,
        assunto: l.assunto,
        motivo: l.motivo,
        texto: l.texto,
        em: l.created_at,
      })),
    });
  } catch (err) {
    console.error('[API ia/piloto GET]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTeamContext();
    if (!ctx || (!ctx.isManager && ctx.role !== 'supervisor')) {
      return NextResponse.json({ ok: false, message: 'Só gestor ou supervisor altera o piloto.' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Partial<PilotoConfig>;
    return NextResponse.json({ ok: true, config: await gravarConfigPiloto(body) });
  } catch (err) {
    console.error('[API ia/piloto POST]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
