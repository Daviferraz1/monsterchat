import { NextRequest, NextResponse } from 'next/server';
import { completarMensagem } from '@/lib/api/ia/autocompletar';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

/** POST /api/ia/completar { conversationId, texto } → { continuacao } (ver lib/api/ia/autocompletar.ts). */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { conversationId?: string; texto?: string };
    const texto = typeof body.texto === 'string' ? body.texto : '';
    if (!body.conversationId || texto.trim().length < 3 || texto.length > 2000) {
      return NextResponse.json({ continuacao: '' });
    }
    return NextResponse.json({ continuacao: await completarMensagem(body.conversationId, texto) });
  } catch (err) {
    console.error('[API ia/completar]', err);
    return NextResponse.json({ continuacao: '' });
  }
}
