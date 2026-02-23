import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';
import type { DigitalGuruProduct } from '@/types';
import {
  normalizePhone,
  normalizeEmail,
  parseGuruWebhook,
  applyParsedTransactionToContacts,
  insertGuruSale,
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
      message: 'Envie um POST com o payload do webhook de transações do Digital Manager Guru.',
      docs: 'https://docs.digitalmanager.guru/developers/webhook-para-transacoes',
      how_to_verify: [
        '1. Configure o webhook na Guru (URL desta API) e DIGITAL_GURU_ACCOUNT_TOKEN no ambiente.',
        '2. Após uma venda na Guru, abra o contato no MonsterChat (mesmo email/telefone) e veja o bloco "Digital Guru" no perfil.',
        '3. Veja os logs da Vercel (Functions) por "[Digital Guru]" para debug.',
      ],
      sync_import: 'POST /api/integrations/digital-guru/sync com { api_token, transactions: [...] } para importar transações antigas.',
    },
    { status: 200 }
  );
}

/**
 * POST /api/integrations/digital-guru
 *
 * 1) Webhook oficial do Digital Manager Guru (webhook_type === "transaction"):
 *    Valida api_token com DIGITAL_GURU_ACCOUNT_TOKEN, extrai contact.email, contact.phone_number,
 *    product/items, status e datas. Sempre retorna HTTP 200 quando o token é válido (exigência da Guru).
 *
 * 2) Payload genérico (sem webhook_type):
 *    Body: email?, phone?, product_name, product_id?, order_id?, situation?, purchased_at?
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    let parsed: { email: string; phone: string; products: DigitalGuruProduct[]; situation: string };
    const isGuruWebhook = body.webhook_type === 'transaction' && body.api_token != null;

    if (isGuruWebhook) {
      const token = apiEnv.DIGITAL_GURU_ACCOUNT_TOKEN;
      const receivedToken = typeof body.api_token === 'string' ? body.api_token : '';
      if (token && receivedToken !== token) {
        return NextResponse.json({ error: 'api_token inválido' }, { status: 401 });
      }
      const guruParsed = parseGuruWebhook(body);
      if (!guruParsed) {
        return NextResponse.json(
          { ok: true, updated: 0, message: 'Payload Guru sem contact ou produtos válidos.' },
          { status: 200 }
        );
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

    const result = await applyParsedTransactionToContacts(parsed);

    const productNames = parsed.products.map((p) => p.name).join(', ');
    const soldAt = parsed.products[0]?.purchased_at ?? new Date().toISOString();
    const contactName =
      (isGuruWebhook && body.contact && typeof body.contact === 'object' && (body.contact as Record<string, unknown>).name) ||
      (typeof body.name === 'string' ? body.name : null);
    await insertGuruSale({
      transaction_id: typeof body.id === 'string' ? body.id : null,
      contact_email: parsed.email,
      contact_phone: parsed.phone,
      contact_name: typeof contactName === 'string' ? contactName : null,
      product_names: productNames,
      status: parsed.situation || null,
      sold_at: soldAt,
      contact_id: result.contact_ids[0] ?? null,
    });

    if (result.updated === 0) {
      return NextResponse.json(
        {
          ok: true,
          updated: 0,
          message:
            'Nenhum contato encontrado com esse email ou telefone. A venda foi registrada no Digital Guru.',
        },
        { status: 200 }
      );
    }

    const productNamesForMessage = parsed.products.map((p) => p.name).join(', ');
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      contact_ids: result.contact_ids,
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
