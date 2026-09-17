import { NextResponse } from 'next/server';
import { enviarFollowupsPendentes } from '@/lib/api/services/instagram-followup';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/instagram/cron/followup — dispara a segunda mensagem (oferta) dos leads
 * que receberam o material e ficaram quietos.
 *
 * Roda de hora em hora pelo cron da Vercel. O webhook do Instagram também chama
 * esta lógica de carona a cada evento recebido: se o cron falhar ou o plano
 * limitar a frequência, a fila continua andando com o movimento normal do canal.
 */
export async function GET() {
  const resultado = await enviarFollowupsPendentes();
  return NextResponse.json({ ok: true, ...resultado });
}
