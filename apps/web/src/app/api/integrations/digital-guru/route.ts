import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { apiEnv } from '@/lib/api/env';
import type { DigitalGuruMetadata, DigitalGuruProduct } from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET: apenas informativo; o webhook da Guru usa POST. */
export async function GET() {
  return NextResponse.json(
    {
      integration: 'digital-guru',
      method: 'POST',
      message: 'Envie um POST com o payload do webhook de transações do Digital Manager Guru.',
      docs: 'https://docs.digitalmanager.guru/developers/webhook-para-transacoes',
    },
    { status: 200 }
  );
}

/** Normaliza telefone: só dígitos (para comparar com contatos). */ só dígitos (para comparar com contatos). */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

/** Normaliza email: trim e minúsculo. */
function normalizeEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Converte o payload do webhook do Digital Manager Guru (transaction) para o formato interno.
 * Ref: https://docs.digitalmanager.guru/developers/webhook-para-transacoes
 */
function parseGuruWebhook(body: Record<string, unknown>): {
  email: string;
  phone: string;
  products: DigitalGuruProduct[];
  situation: string;
} | null {
  if (body.webhook_type !== 'transaction' || !body.contact || typeof body.contact !== 'object') {
    return null;
  }
  const contact = body.contact as Record<string, unknown>;
  const email = normalizeEmail(contact.email as string | undefined);
  const localCode = String(contact.phone_local_code ?? '').replace(/\D/g, '');
  const phoneNum = String(contact.phone_number ?? '').replace(/\D/g, '');
  const rawPhone = (localCode + phoneNum).trim() || String(contact.phone_number ?? '');
  const phone = normalizePhone(rawPhone);

  if (!email && !phone) return null;

  const orderId = typeof body.id === 'string' ? body.id : undefined;
  const status = typeof body.status === 'string' ? body.status : '';
  const dates = body.dates as Record<string, unknown> | undefined;
  const purchasedAt =
    (dates?.ordered_at as string) || (dates?.created_at as string) || new Date().toISOString();

  const products: DigitalGuruProduct[] = [];

  const items = body.items as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      const name = item.name as string;
      if (name) {
        products.push({
          name,
          product_id: item.id as string | undefined,
          order_id: orderId,
          purchased_at: purchasedAt,
        });
      }
    }
  }

  const singleProduct = body.product as Record<string, unknown> | undefined;
  if (products.length === 0 && singleProduct && typeof singleProduct.name === 'string') {
    products.push({
      name: singleProduct.name as string,
      product_id: singleProduct.id as string | undefined,
      order_id: orderId,
      purchased_at: purchasedAt,
    });
  }

  if (products.length === 0) return null;

  return { email, phone, products, situation: status };
}

/**
 * POST /api/integrations/digital-guru
 *
 * 1) Webhook oficial do Digital Manager Guru (webhook_type === "transaction"):
 *    Valida api_token com DIGITAL_GURU_ACCOUNT_TOKEN, extrai contact.email, contact.phone_number,
 *    product/items, status e datas. Sempre retorna HTTP 200 quando o token é válido (exigência da Guru).
 *    Ref: https://docs.digitalmanager.guru/developers/webhook-para-transacoes
 *
 * 2) Payload genérico (sem webhook_type):
 *    Body: email?, phone?, product_name, product_id?, order_id?, situation?, purchased_at?
 *    Pelo menos um de email ou phone; product_name obrigatório.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    let email: string;
    let phone: string;
    let products: DigitalGuruProduct[];
    let situation: string | undefined;
    const isGuruWebhook = body.webhook_type === 'transaction' && body.api_token != null;

    if (isGuruWebhook) {
      const token = apiEnv.DIGITAL_GURU_ACCOUNT_TOKEN;
      const receivedToken = typeof body.api_token === 'string' ? body.api_token : '';
      if (token && receivedToken !== token) {
        return NextResponse.json({ error: 'api_token inválido' }, { status: 401 });
      }
      const parsed = parseGuruWebhook(body);
      if (!parsed) {
        return NextResponse.json(
          { ok: true, updated: 0, message: 'Payload Guru sem contact ou produtos válidos.' },
          { status: 200 }
        );
      }
      email = parsed.email;
      phone = parsed.phone;
      products = parsed.products;
      situation = parsed.situation || undefined;
    } else {
      const rawEmail = body.email;
      const rawPhone = body.phone;
      const product_name = body.product_name;
      email = normalizeEmail(rawEmail as string | undefined);
      phone = normalizePhone(rawPhone as string | undefined);

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
      products = [
        {
          name: product_name,
          product_id: body.product_id as string | undefined,
          order_id: body.order_id as string | undefined,
          purchased_at:
            (body.purchased_at as string) || new Date().toISOString(),
        },
      ];
      situation = body.situation as string | undefined;
    }

    const { data: allContacts, error: fetchError } = await supabaseAdmin
      .from('contacts')
      .select('id, phone, email, metadata');

    if (fetchError) {
      console.error('[Digital Guru] Erro ao buscar contatos:', fetchError);
      const status = isGuruWebhook ? 200 : 500;
      return NextResponse.json(
        isGuruWebhook
          ? { ok: false, updated: 0, message: 'Erro ao buscar contatos.' }
          : { error: 'Erro ao buscar contatos', detail: fetchError.message },
        { status }
      );
    }

    const matched = (allContacts || []).filter((c) => {
      const cPhone = normalizePhone(c.phone);
      const cEmail = normalizeEmail(c.email);
      if (phone && cPhone && cPhone === phone) return true;
      if (email && cEmail && cEmail === email) return true;
      return false;
    });

    if (matched.length === 0) {
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

    const updatedIds: string[] = [];
    for (const contact of matched) {
      const current = (contact.metadata?.digital_guru as DigitalGuruMetadata | undefined) || {
        is_student: true,
        products: [],
      };
      const existingProducts = Array.isArray(current.products) ? [...current.products] : [];
      for (const p of products) {
        existingProducts.push(p);
      }
      const nextDigitalGuru: DigitalGuruMetadata = {
        is_student: true,
        customer_id: current.customer_id,
        products: existingProducts,
        situation: situation ?? current.situation,
        last_sync_at: new Date().toISOString(),
      };
      const nextMetadata = {
        ...(contact.metadata || {}),
        digital_guru: nextDigitalGuru,
      };

      const { error: updateError } = await supabaseAdmin
        .from('contacts')
        .update({
          metadata: nextMetadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contact.id);

      if (updateError) {
        console.error('[Digital Guru] Erro ao atualizar contato:', contact.id, updateError);
        continue;
      }
      updatedIds.push(contact.id);
    }

    const productNames = products.map((p) => p.name).join(', ');
    return NextResponse.json({
      ok: true,
      updated: updatedIds.length,
      contact_ids: updatedIds,
      message:
        updatedIds.length > 0
          ? `Contato(s) atualizado(s) como aluno. Produto(s): ${productNames}`
          : 'Nenhum contato atualizado.',
    });
  } catch (error) {
    console.error('[Digital Guru] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao processar integração Digital Guru' },
      { status: 500 }
    );
  }
}
