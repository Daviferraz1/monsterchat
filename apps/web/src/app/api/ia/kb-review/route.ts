import { NextResponse } from 'next/server';
import { getTeamContext } from '@/lib/api/team';
import { approve, countPending, listPending, reject } from '@/lib/api/ia/kb-review';

export const dynamic = 'force-dynamic';

/**
 * Fila de curadoria da base de conhecimento.
 *
 * Restrita a quem manda: aprovar aqui define o que a IA vai responder para todo
 * aluno daqui pra frente — é escrita na fonte da verdade, não uma preferência
 * de tela.
 */
export async function GET() {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ctx.isManager && ctx.role !== 'supervisor') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const [items, pending] = await Promise.all([listPending(), countPending()]);
  return NextResponse.json({ items, pending });
}

export async function POST(request: Request) {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ctx.isManager && ctx.role !== 'supervisor') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      action?: 'approve' | 'reject';
      questionPattern?: string;
      goldResponse?: string;
      category?: string;
      forceNew?: boolean;
      note?: string;
    };

    if (!body.id || (body.action !== 'approve' && body.action !== 'reject')) {
      return NextResponse.json({ error: 'Informe id e action' }, { status: 400 });
    }

    if (body.action === 'reject') {
      const ok = await reject(body.id, ctx.userId, body.note);
      return ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: 'Falha ao descartar' }, { status: 500 });
    }

    const result = await approve({
      id: body.id,
      reviewerId: ctx.userId,
      questionPattern: body.questionPattern,
      goldResponse: body.goldResponse,
      category: body.category,
      forceNew: body.forceNew,
    });
    if ('error' in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[API ia/kb-review] POST', err);
    return NextResponse.json({ error: 'Falha ao revisar' }, { status: 500 });
  }
}
