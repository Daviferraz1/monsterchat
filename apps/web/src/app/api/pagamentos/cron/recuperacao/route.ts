import { NextResponse } from 'next/server';
import {
  enviarRecuperacoesPendentes,
  simularRecuperacoes,
} from '@/lib/api/services/recuperacao-pagamento';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/pagamentos/cron/recuperacao — lembra quem gerou boleto ou PIX e não pagou.
 *
 * Roda de hora em hora pelo cron da Vercel; o próprio serviço respeita o horário
 * comercial e o teto por execução, então rodar demais não causa dano — nas horas
 * fechadas ele devolve o motivo e não manda nada.
 *
 * `?simular=1` mostra a fila sem enviar. É como conferir a régua antes de ligar.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('simular')) {
    const fila = await simularRecuperacoes();
    return NextResponse.json({ ok: true, simulacao: true, ...fila });
  }
  const resultado = await enviarRecuperacoesPendentes();
  return NextResponse.json({ ok: true, ...resultado });
}
