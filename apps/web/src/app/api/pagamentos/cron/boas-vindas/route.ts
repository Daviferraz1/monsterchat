import { NextRequest, NextResponse } from 'next/server';
import { enviarBoasVindas, simularBoasVindas } from '@/lib/api/services/boas-vindas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/pagamentos/cron/boas-vindas — avisa pelo WhatsApp quem acabou de
 * comprar (acesso liberado) ou de gerar boleto (pedido recebido).
 *
 * O webhook da Guru já dispara na hora para cada transação; este cron é a rede
 * de segurança: pega o que ficou fora do horário, o que a Guru não respondeu e
 * o que o webhook não conseguiu mandar. A unique (transação, tipo) impede
 * mensagem em dobro.
 *
 * `?simular=1` mostra a fila sem enviar.
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
    const fila = await simularBoasVindas();
    return NextResponse.json({ ok: true, simulacao: true, ...fila });
  }
  const resultado = await enviarBoasVindas();
  return NextResponse.json({ ok: true, ...resultado });
}
