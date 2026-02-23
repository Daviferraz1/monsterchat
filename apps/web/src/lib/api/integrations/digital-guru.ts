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
  payment_method?: string | null;
  payment_total?: number | null;
  address_full?: string | null;
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

  // Meio de pagamento
  const payment = body.payment as Record<string, unknown> | undefined;
  let payment_method: string | null = null;
  let payment_total: number | null = null;
  if (payment && typeof payment === 'object') {
    const method = payment.method as string | Record<string, unknown> | undefined;
    payment_method =
      typeof method === 'string'
        ? method
        : method && typeof method === 'object' && typeof (method as Record<string, unknown>).name === 'string'
          ? (method as Record<string, unknown>).name as string
          : null;
    const total = payment.total;
    if (typeof total === 'number') payment_total = total;
    else if (typeof total === 'string') payment_total = parseFloat(total) || null;
  }

  // Endereço (contact)
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (v != null && String(v).trim()) parts.push(String(v).trim());
  };
  push(contact.address);
  push(contact.address_number);
  push(contact.address_comp);
  push(contact.address_district);
  push(contact.address_city);
  if (contact.address_state) parts.push(String(contact.address_state).trim());
  if (contact.address_zip_code) parts.push(String(contact.address_zip_code).trim());
  push(contact.address_country);
  const address_full = parts.length ? parts.filter(Boolean).join(', ') : null;

  return {
    email,
    phone,
    products,
    situation: status,
    payment_method: payment_method ?? undefined,
    payment_total: payment_total ?? undefined,
    address_full: address_full ?? undefined,
  };
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

/** Obtém o ID do canal Guru (para contatos criados a partir de vendas). Cria o canal se não existir. */
export async function getOrCreateGuruChannel(): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from('channels')
    .select('id')
    .eq('type', 'guru')
    .eq('external_id', 'guru')
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: inserted, error } = await supabaseAdmin
    .from('channels')
    .insert({
      type: 'guru',
      name: 'Guru (vendas)',
      external_id: 'guru',
      access_token: 'guru-placeholder',
      is_active: true,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Digital Guru] Erro ao criar canal Guru:', error);
    return null;
  }
  return inserted?.id ?? null;
}

/**
 * Garante um contato para a venda: atualiza existente (por e-mail/telefone) ou cria novo contato Guru.
 * Assim todos os contatos de vendas ficam em Contatos, sem duplicar quem já está no chat.
 */
export async function ensureContactForSale(
  parsed: { email: string; phone: string; products: DigitalGuruProduct[]; situation: string },
  options?: { contactName?: string | null }
): Promise<{ contact_id: string | null; updated: number }> {
  const result = await applyParsedTransactionToContacts(parsed);
  if (result.contact_ids.length > 0) {
    return { contact_id: result.contact_ids[0], updated: result.updated };
  }

  const channelId = await getOrCreateGuruChannel();
  if (!channelId) return { contact_id: null, updated: 0 };

  const externalId = parsed.email || parsed.phone;
  const name = options?.contactName?.trim() || null;
  const digitalGuru: DigitalGuruMetadata = {
    is_student: true,
    products: parsed.products,
    situation: parsed.situation,
    last_sync_at: new Date().toISOString(),
  };

  const { data: newContact, error: insertContactError } = await supabaseAdmin
    .from('contacts')
    .insert({
      channel_type: 'guru',
      external_id: externalId,
      name: name || undefined,
      email: parsed.email || undefined,
      phone: parsed.phone || undefined,
      metadata: { digital_guru: digitalGuru },
    })
    .select('id')
    .single();

  if (insertContactError) {
    if ((insertContactError as { code?: string }).code === '23505') {
      // unique (channel_type, external_id) - contato já existe (criado entre o apply e aqui), usar ele
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('id, metadata')
        .eq('channel_type', 'guru')
        .eq('external_id', externalId)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        const current = (existing.metadata?.digital_guru as DigitalGuruMetadata | undefined) || { is_student: true, products: [] };
        const products = [...(Array.isArray(current.products) ? current.products : []), ...parsed.products];
        await supabaseAdmin
          .from('contacts')
          .update({
            metadata: { ...existing.metadata, digital_guru: { ...current, products, situation: parsed.situation, last_sync_at: new Date().toISOString() } },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        return { contact_id: existing.id, updated: 0 };
      }
    }
    console.error('[Digital Guru] Erro ao criar contato da venda:', insertContactError);
    return { contact_id: null, updated: 0 };
  }

  if (!newContact?.id) return { contact_id: null, updated: 0 };

  const { error: convError } = await supabaseAdmin.from('conversations').insert({
    channel_id: channelId,
    contact_id: newContact.id,
    status: 'open',
  });
  if (convError) {
    console.error('[Digital Guru] Erro ao criar conversa do contato Guru:', convError);
  }

  return { contact_id: newContact.id, updated: 0 };
}

export interface GuruSaleInsert {
  transaction_id: string | null;
  contact_email: string;
  contact_phone: string;
  contact_name: string | null;
  product_names: string;
  status: string | null;
  sold_at: string;
  contact_id: string | null;
  payment_method?: string | null;
  payment_total?: number | null;
  address_full?: string | null;
}

/** Registra uma venda na tabela guru_sales (para o painel "Últimas vendas"). */
export async function insertGuruSale(row: GuruSaleInsert): Promise<void> {
  const { error } = await supabaseAdmin.from('guru_sales').insert({
    transaction_id: row.transaction_id || null,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    contact_name: row.contact_name || null,
    product_names: row.product_names,
    status: row.status || null,
    sold_at: row.sold_at,
    contact_id: row.contact_id || null,
    payment_method: row.payment_method ?? null,
    payment_total: row.payment_total ?? null,
    address_full: row.address_full ?? null,
  });
  if (error) {
    console.error('[Digital Guru] Erro ao inserir guru_sales:', error);
  }
}
