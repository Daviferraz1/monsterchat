import { NextRequest, NextResponse } from 'next/server';
import { enviarOnboarding, simularOnboarding } from '@/lib/api/services/onboarding';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/pagamentos/cron/onboarding — a régua que continua depois do
 * "acesso liberado": dia 1 (entrou?) e dia 3 (o que a plataforma faz por você).
 *
 * Roda de hora em hora porque cada etapa tem hora certa a partir da compra e
 * só sai entre 9h e 20h. A unique (transação, tipo) em `boas_vindas_envios`
 * impede mensagem em dobro quando duas rodadas se cruzam.
 *
 * `?simular=1` mostra a fila sem enviar — é como conferir antes de ligar.
 *
 * Protegida por CRON_SECRET no header; o middleware libera o prefixo
 * /api/pagamentos/cron/ porque a checagem é aqui.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get('simular')) {
    const fila = await simularOnboarding();
    return NextResponse.json({ ok: true, simulacao: true, ...fila });
  }
  const resultado = await enviarOnboarding();
  return NextResponse.json({ ok: true, ...resultado });
}
