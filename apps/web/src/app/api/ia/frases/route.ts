import { NextResponse } from 'next/server';
import { frasesEquipe } from '@/lib/api/ia/frases-equipe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** GET /api/ia/frases → frases mais repetidas pela equipe, para o autocompletar sem IA. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, frases: await frasesEquipe() });
  } catch (err) {
    console.error('[API ia/frases]', err);
    return NextResponse.json({ ok: false, frases: [] }, { status: 500 });
  }
}
