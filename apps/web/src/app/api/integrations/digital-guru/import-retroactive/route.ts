import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';
import { parseGuruWebhook, ensureContactForSale, insertGuruSale } from '@/lib/api/integrations/digital-guru';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/integrations/digital-guru/import-retroactive
 *
 * Importa pedidos retroativos em lote (mesmo formato do webhook da Guru).
 * Body: { transactions: Array<GuruWebhookPayload> }
 * Usa DIGITAL_GURU_ACCOUNT_TOKEN do servidor (não precisa enviar o token no body).
 * Para uso pela UI "Importar vendas antigas".
 */
export async function POST(request: NextRequest) {
  try {
    const apiToken = apiEnv.DIGITAL_GURU_ACCOUNT_TOKEN;
    if (!apiToken) {
      return NextResponse.json(
        { error: 'DIGITAL_GURU_ACCOUNT_TOKEN não configurado no servidor.' },
        { status: 501 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const rawList = body.transactions;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return NextResponse.json(
        { error: 'Envie { transactions: [ ... ] } com pelo menos uma transação no formato da Guru.' },
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
        const contact = payload.contact as Record<string, unknown> | undefined;
        const contactName = contact && typeof contact.name === 'string' ? contact.name : null;
        const result = await ensureContactForSale(parsed, { contactName });
        processed += 1;
        updated += result.updated;
        const productNames = parsed.products.map((p) => p.name).join(', ');
        const soldAt = parsed.products[0]?.purchased_at ?? new Date().toISOString();
        await insertGuruSale({
          transaction_id: typeof payload.id === 'string' ? payload.id : null,
          contact_email: parsed.email,
          contact_phone: parsed.phone,
          contact_name: contactName,
          product_names: productNames,
          status: parsed.situation || null,
          sold_at: soldAt,
          contact_id: result.contact_id ?? null,
          payment_method: parsed.payment_method ?? null,
          payment_total: parsed.payment_total ?? null,
          address_full: parsed.address_full ?? null,
        });
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
    console.error('[Digital Guru import-retroactive] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao importar vendas' },
      { status: 500 }
    );
  }
}
