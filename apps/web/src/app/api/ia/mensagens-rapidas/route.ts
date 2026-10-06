import { NextRequest, NextResponse } from 'next/server';
import { getTeamContext } from '@/lib/api/team';
import {
  RESPOSTAS_INICIAIS,
  gravarRespostasEquipe,
  lerRespostasEquipe,
  limparCacheMensagens,
  mensagensDoAluno,
  mensagensGerais,
  type RespostaEquipe,
} from '@/lib/api/ia/mensagens-rapidas';

export const dynamic = 'force-dynamic';

/**
 * Mensagens rápidas (ver lib/api/ia/mensagens-rapidas.ts).
 *
 *   GET                          → equipe + cursos + editais (igual para todos)
 *   GET ?conversationId=…        → só as "deste aluno" (boleto/PIX em aberto)
 *   GET ?equipe=1                → respostas da equipe para o editor do admin
 *   PUT { itens }                → grava as respostas da equipe (gestor/supervisor/admin)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const conversationId = sp.get('conversationId');
    if (conversationId) {
      return NextResponse.json({ ok: true, mensagens: await mensagensDoAluno(conversationId) });
    }
    if (sp.get('equipe')) {
      return NextResponse.json({ ok: true, itens: await lerRespostasEquipe(), iniciais: RESPOSTAS_INICIAIS });
    }
    return NextResponse.json({ ok: true, mensagens: await mensagensGerais() });
  } catch (err) {
    console.error('[API mensagens-rapidas GET]', err);
    return NextResponse.json({ ok: false, mensagens: [] }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ ok: false, message: 'Não autenticado.' }, { status: 401 });
    if (!ctx.isManager && ctx.role !== 'supervisor') {
      return NextResponse.json({ ok: false, message: 'Só gestor ou supervisor edita as respostas da equipe.' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { itens?: RespostaEquipe[] };
    if (!Array.isArray(body.itens)) return NextResponse.json({ ok: false, message: 'Lista inválida.' }, { status: 400 });
    const itens = body.itens
      .map((r, i) => ({
        id: String(r.id || `r${Date.now()}${i}`).slice(0, 60),
        titulo: String(r.titulo ?? '').trim().slice(0, 120),
        texto: String(r.texto ?? '').trim().slice(0, 4000),
      }))
      .filter((r) => r.titulo && r.texto);
    await gravarRespostasEquipe(itens);
    limparCacheMensagens();
    return NextResponse.json({ ok: true, itens });
  } catch (err) {
    console.error('[API mensagens-rapidas PUT]', err);
    return NextResponse.json({ ok: false, message: 'Falha ao salvar.' }, { status: 500 });
  }
}
