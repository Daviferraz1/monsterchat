import { NextRequest, NextResponse } from 'next/server';
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
 *
 * Protegida por CRON_SECRET no header, como os outros crons: o middleware libera
 * o prefixo /api/pagamentos/cron/ justamente porque a checagem é aqui. Sem isso a
 * rota levaria 401 do middleware e a régua nunca rodaria — em silêncio.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get('simular')) {
    const fila = await simularRecuperacoes();
    return NextResponse.json({ ok: true, simulacao: true, ...fila });
  }
  const resultado = await enviarRecuperacoesPendentes();
  return NextResponse.json({ ok: true, ...resultado });
}
