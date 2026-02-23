import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';
import { parseGuruWebhook, applyParsedTransactionToContacts } from '@/lib/api/integrations/digital-guru';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/integrations/digital-guru/sync
 *
 * Importa transações antigas em lote (mesmo formato do webhook da Guru).
 * Body: { api_token: string, transactions: Array<GuruWebhookPayload> }
 *
 * Use para puxar dados antigos: busque as transações na API da Guru (Transactions/Myorders)
 * com seu User Token e envie o array aqui. Ou exporte do admin e monte o JSON.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const apiToken = typeof body.api_token === 'string' ? body.api_token : '';
    const expectedToken = apiEnv.DIGITAL_GURU_ACCOUNT_TOKEN;
    if (expectedToken && apiToken !== expectedToken) {
      return NextResponse.json({ error: 'api_token inválido' }, { status: 401 });
    }

    const rawList = body.transactions;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return NextResponse.json(
        { error: 'Envie { api_token, transactions: [ ... ] } com pelo menos uma transação.' },
        { status: 400 }
      );
    }

    let processed = 0;
    let updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < rawList.length; i++) {
      const payload = rawList[i] as Record<string, unknown>;
      const withType = { ...payload, webhook_type: 'transaction', api_token: apiToken };
      const parsed = parseGuruWebhook(withType);
      if (!parsed) {
        errors.push(`Transação ${i + 1}: sem contact ou produtos válidos`);
        continue;
      }
      try {
        const result = await applyParsedTransactionToContacts(parsed);
        processed += 1;
        updated += result.updated;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Transação ${i + 1}: ${msg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      processed,
      contacts_updated: updated,
      total_sent: rawList.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Processadas ${processed} transações; ${updated} contato(s) atualizado(s).`,
    });
  } catch (error) {
    console.error('[Digital Guru sync] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao sincronizar transações' },
      { status: 500 }
    );
  }
}
