import { supabaseAdmin } from '@/lib/api/supabase';
import type { DigitalGuruMetadata, DigitalGuruProduct } from '@/types';

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

export function normalizeEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Converte o payload do webhook do Digital Manager Guru (transaction) para o formato interno.
 * Ref: https://docs.digitalmanager.guru/developers/webhook-para-transacoes
 */
export function parseGuruWebhook(body: Record<string, unknown>): {
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

  // Telefone: preferir phone_full_number (ex.: "5528999948738"); senão montar com phone_local_code + phone_number
  // Normalizar sempre só dígitos para bater com o que temos no MonsterChat (ex.: 5528999948738)
  let phone: string;
  const fullNumber = contact.phone_full_number as string | undefined;
  if (fullNumber && normalizePhone(fullNumber)) {
    phone = normalizePhone(fullNumber);
  } else {
    const localCode = String(contact.phone_local_code ?? '').replace(/\D/g, '');
    const phoneNum = String(contact.phone_number ?? '').replace(/\D/g, '');
    const rawPhone = (localCode + phoneNum).trim() || String(contact.phone_number ?? '');
    phone = normalizePhone(rawPhone);
  }

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
 * Aplica uma transação já parseada aos contatos no Supabase.
 * Retorna quantidade de contatos atualizados.
 */
export async function applyParsedTransactionToContacts(
  parsed: { email: string; phone: string; products: DigitalGuruProduct[]; situation: string }
): Promise<{ updated: number; contact_ids: string[] }> {
  const { email, phone, products, situation } = parsed;

  const { data: allContacts, error: fetchError } = await supabaseAdmin
    .from('contacts')
    .select('id, phone, email, metadata');

  if (fetchError) {
    throw fetchError;
  }

  const matched = (allContacts || []).filter((c) => {
    const cPhone = normalizePhone(c.phone);
    const cEmail = normalizeEmail(c.email);
    if (phone && cPhone && cPhone === phone) return true;
    if (email && cEmail && cEmail === email) return true;
    return false;
  });

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

  return { updated: updatedIds.length, contact_ids: updatedIds };
}
