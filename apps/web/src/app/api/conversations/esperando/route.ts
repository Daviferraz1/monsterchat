import { NextResponse } from 'next/server';
import { perguntasEsperando } from '@/lib/api/services/perguntas-esperando';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/conversations/esperando → conversas com pergunta real do aluno sem resposta. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, itens: await perguntasEsperando() });
  } catch (err) {
    console.error('[API conversations/esperando]', err);
    return NextResponse.json({ ok: false, itens: [] }, { status: 500 });
  }
}
