import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';
import type { DigitalGuruProduct } from '@/types';
import {
  normalizePhone,
  normalizeEmail,
  parseGuruWebhook,
  parseGuruWebhookMinimal,
  ensureContactForSale,
  insertGuruSale,
  parseGuruSubscriptionWebhook,
  ensureContactForSubscription,
  upsertGuruSubscription,
} from '@/lib/api/integrations/digital-guru';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET: informativo e status da integração (webhook configurado?). */
export async function GET() {
  const webhookConfigured = !!apiEnv.DIGITAL_GURU_ACCOUNT_TOKEN;
  return NextResponse.json(
    {
      integration: 'digital-guru',
      webhook_configured: webhookConfigured,
      method: 'POST',
      message: 'Envie um POST com o payload do webhook do Digital Manager Guru (transações ou assinaturas).',
      webhooks: [
        { type: 'transaction', docs: 'https://docs.digitalmanager.guru/developers/webhook-para-transacoes' },
        { type: 'subscription', docs: 'https://docs.digitalmanager.guru/developers/webhook-para-assinaturas' },
      ],
      how_to_verify: [
        '1. Configure o webhook na Guru (URL desta API) e DIGITAL_GURU_ACCOUNT_TOKEN no ambiente.',
        '2. Transações: veja "Últimas vendas". Assinaturas: veja "Assinaturas" no menu.',
        '3. Veja os logs por "[Digital Guru]" para debug.',
      ],
      sync_import: 'POST /api/integrations/digital-guru/sync com { api_token, transactions: [...] } para importar transações antigas.',
    },
    { status: 200 }
  );
}

/**
 * POST /api/integrations/digital-guru
 *
 * 1) Webhook de assinaturas (webhook_type === "subscription"): upsert em guru_subscriptions.
 * 2) Webhook de transações (webhook_type === "transaction"): contato + guru_sales.
 * 3) Payload genérico (sem webhook_type): email?, phone?, product_name, etc.
 */
export async function POST(request: NextRequest) {
  try {
    let body = (await request.json()) as Record<string, unknown>;
    if (body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)) {
      body = body.payload as Record<string, unknown>;
    }

    const isSubscriptionWebhook = body.webhook_type === 'subscription' && body.api_token != null;
    if (isSubscriptionWebhook) {
      const token = apiEnv.DIGITAL_GURU_ACCOUNT_TOKEN;
      const receivedToken = typeof body.api_token === 'string' ? body.api_token : '';
      if (token && receivedToken !== token) {
        return NextResponse.json({ error: 'api_token inválido' }, { status: 401 });
      }
      const parsedSub = parseGuruSubscriptionWebhook(body);
      if (!parsedSub) {
        return NextResponse.json(
          { ok: true, updated: 0, message: 'Payload de assinatura sem id válido.' },
          { status: 200 }
        );
      }
      const contactId = await ensureContactForSubscription(
        parsedSub.subscriber_email ?? '',
        parsedSub.subscriber_phone ?? '',
        parsedSub.subscriber_name
      );
      await upsertGuruSubscription({ ...parsedSub, contact_id: contactId ?? null });
      return NextResponse.json({
        ok: true,
        subscription_id: parsedSub.subscription_id,
        contact_id: contactId,
        is_overdue: parsedSub.is_overdue,
        message: 'Assinatura registrada/atualizada.',
      }, { status: 200 });
    }

    let parsed: { email: string; phone: string; products: DigitalGuruProduct[]; situation: string };
    const isGuruWebhook = body.webhook_type === 'transaction' && body.api_token != null;

    if (isGuruWebhook) {
      const token = apiEnv.DIGITAL_GURU_ACCOUNT_TOKEN;
      const receivedToken = typeof body.api_token === 'string' ? body.api_token : '';
      if (token && receivedToken !== token) {
        return NextResponse.json({ error: 'api_token inválido' }, { status: 401 });
      }
      let guruParsed = parseGuruWebhook(body);
      if (!guruParsed) {
        const minimalParsed = parseGuruWebhookMinimal(body);
        if (!minimalParsed) {
          return NextResponse.json(
            { ok: true, updated: 0, message: 'Payload Guru sem dados válidos (id, product/items).' },
            { status: 200 }
          );
        }
        console.warn('[Digital Guru] Parse completo falhou; usando parse mínimo para salvar venda', { id: body.id });
        guruParsed = minimalParsed;
      }
      parsed = guruParsed;
    } else {
      const email = normalizeEmail(body.email as string | undefined);
      const phone = normalizePhone(body.phone as string | undefined);
      const product_name = body.product_name;
      if (!email && !phone) {
        return NextResponse.json(
          { error: 'Envie pelo menos um de: email ou phone' },
          { status: 400 }
        );
      }
      if (!product_name || typeof product_name !== 'string') {
        return NextResponse.json(
          { error: 'product_name é obrigatório' },
          { status: 400 }
        );
      }
      parsed = {
        email,
        phone,
        products: [
          {
            name: product_name,
            product_id: body.product_id as string | undefined,
            order_id: body.order_id as string | undefined,
            purchased_at: (body.purchased_at as string) || new Date().toISOString(),
          },
        ],
        situation: (body.situation as string) || '',
      };
    }

    const result = await ensureContactForSale(parsed, {
      contactName: isGuruWebhook && body.contact && typeof body.contact === 'object'
        ? (body.contact as Record<string, unknown>).name as string | undefined
        : typeof body.name === 'string' ? body.name : undefined,
    });

    const productNames = parsed.products.map((p) => p.name).join(', ');
    const soldAt = parsed.products[0]?.purchased_at ?? new Date().toISOString();
    const contactName =
      (isGuruWebhook && body.contact && typeof body.contact === 'object' && (body.contact as Record<string, unknown>).name) ||
      (typeof body.name === 'string' ? body.name : null);
    const extendedParsed = isGuruWebhook ? (parsed as typeof parsed & { payment_method?: string | null; payment_total?: number | null; address_full?: string | null }) : null;
    try {
      await insertGuruSale({
        transaction_id: typeof body.id === 'string' ? body.id : null,
        contact_email: parsed.email,
        contact_phone: parsed.phone,
        contact_name: typeof contactName === 'string' ? contactName : null,
        product_names: productNames,
        status: parsed.situation || null,
        sold_at: soldAt,
        contact_id: result.contact_id ?? null,
        payment_method: extendedParsed?.payment_method ?? null,
        payment_total: extendedParsed?.payment_total ?? null,
        address_full: extendedParsed?.address_full ?? null,
      });
    } catch (insertErr) {
      const err = insertErr as { message?: string; code?: string; details?: string };
      console.error('[Digital Guru] Falha ao salvar em guru_sales:', err?.message ?? insertErr, { code: err?.code, details: err?.details });
      throw insertErr;
    }

    if (result.updated === 0 && !result.contact_id) {
      return NextResponse.json(
        {
          ok: true,
          updated: 0,
          message:
            'Não foi possível criar contato para esta venda. A venda foi registrada no painel.',
        },
        { status: 200 }
      );
    }

    const contactIds = result.contact_id ? [result.contact_id] : [];
    const productNamesForMessage = parsed.products.map((p) => p.name).join(', ');
    if (result.updated === 0) {
      return NextResponse.json({
        ok: true,
        updated: 0,
        contact_ids: contactIds,
        message: result.contact_id
          ? `Contato criado a partir da venda. Produto(s): ${productNamesForMessage}`
          : 'Nenhum contato encontrado com esse email ou telefone. A venda foi registrada no Digital Guru.',
      }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      contact_ids: contactIds,
      message: `Contato(s) atualizado(s) como aluno. Produto(s): ${productNamesForMessage}`,
    });
  } catch (error) {
    console.error('[Digital Guru] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao processar integração Digital Guru' },
      { status: 500 }
    );
  }
}
