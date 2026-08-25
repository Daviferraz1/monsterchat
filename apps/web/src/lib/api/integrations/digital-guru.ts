import { supabaseAdmin } from '@/lib/api/supabase';
import type { DigitalGuruMetadata, DigitalGuruProduct } from '@/types';
import { diaEmBrasilia } from '@/lib/timezone';

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

/**
 * Normaliza telefone para formato canônico (comparação/match).
 * No Brasil: celular pode vir 8 dígitos (ex.: 99061942) ou 9 dígitos (999061942).
 * Ambos representam o mesmo número; normalizamos para 55 + DDD(2) + 9 dígitos.
 * Ex.: 553799061942 (12) e 5537999061942 (13) → ambos viram 5537999061942.
 */
export function normalizePhoneCanonical(phone: string | null | undefined): string {
  const digits = normalizePhone(phone);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length === 12) {
    return digits.slice(0, 4) + '9' + digits.slice(4);
  }
  if (digits.startsWith('55') && digits.length === 11) {
    return digits.slice(0, 4) + '9' + digits.slice(4);
  }
  return digits;
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
 * Parse mínimo do webhook Guru: extrai o que der para não perder vendas quando o parse completo falha
 * (ex.: contact vazio, estrutura diferente). Sempre tenta retornar algo se tiver id + product/items.
 */
export function parseGuruWebhookMinimal(body: Record<string, unknown>): {
  email: string;
  phone: string;
  products: DigitalGuruProduct[];
  situation: string;
  payment_method?: string | null;
  payment_total?: number | null;
  address_full?: string | null;
} | null {
  if (body.webhook_type !== 'transaction' || body.id == null) return null;

  const contact = (body.contact && typeof body.contact === 'object') ? (body.contact as Record<string, unknown>) : null;
  const email = contact ? normalizeEmail(contact.email as string | undefined) : '';
  let phone = '';
  if (contact) {
    const fullNumber = contact.phone_full_number as string | undefined;
    if (fullNumber && normalizePhone(fullNumber)) {
      phone = normalizePhone(fullNumber);
    } else {
      const localCode = String(contact.phone_local_code ?? '').replace(/\D/g, '');
      const phoneNum = String(contact.phone_number ?? '').replace(/\D/g, '');
      const rawPhone = (localCode + phoneNum).trim() || String(contact.phone_number ?? '');
      phone = normalizePhone(rawPhone);
    }
  }

  const orderId = typeof body.id === 'string' ? body.id : String(body.id);
  const status = typeof body.status === 'string' ? body.status : '';
  const dates = body.dates as Record<string, unknown> | undefined;
  const purchasedAt =
    (dates?.ordered_at as string) || (dates?.created_at as string) || new Date().toISOString();

  const products: DigitalGuruProduct[] = [];
  const items = body.items as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(items)) {
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
  if (products.length === 0) {
    products.push({
      name: 'Venda Guru',
      product_id: undefined,
      order_id: orderId,
      purchased_at: purchasedAt,
    });
  }

  let payment_method: string | null = null;
  let payment_total: number | null = null;
  const payment = body.payment as Record<string, unknown> | undefined;
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

  let address_full: string | null = null;
  if (contact) {
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
    address_full = parts.length ? parts.filter(Boolean).join(', ') : null;
  }

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

  const phoneCanon = normalizePhoneCanonical(phone);
  const matched = (allContacts || []).filter((c) => {
    const cPhone = normalizePhone(c.phone);
    const cPhoneCanon = normalizePhoneCanonical(c.phone);
    const cEmail = normalizeEmail(c.email);
    if (phone && (cPhone === phone || (phoneCanon && cPhoneCanon && phoneCanon === cPhoneCanon))) return true;
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

  const externalId = parsed.email || (parsed.phone ? normalizePhoneCanonical(parsed.phone) : '') || parsed.phone;
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

  // Não criar conversa: apenas unificar/criar contato com dados da compra. A conversa será criada quando o atendente iniciar contato (ex.: WhatsApp) ou quando o canal receber mensagem.
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

/** Registra uma venda na tabela guru_sales (para o painel "Últimas vendas"). Lança em caso de erro. */
export async function insertGuruSale(row: GuruSaleInsert): Promise<void> {
  const fullRow = {
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
  };
  let { error } = await supabaseAdmin.from('guru_sales').insert(fullRow);
  if (error && /column.*does not exist|does not exist/i.test(String(error.message))) {
    const { error: err2 } = await supabaseAdmin.from('guru_sales').insert({
      transaction_id: fullRow.transaction_id,
      contact_email: fullRow.contact_email,
      contact_phone: fullRow.contact_phone,
      contact_name: fullRow.contact_name,
      product_names: fullRow.product_names,
      status: fullRow.status,
      sold_at: fullRow.sold_at,
      contact_id: fullRow.contact_id,
    });
    if (err2) {
      console.error('[Digital Guru] Erro ao inserir guru_sales (fallback sem colunas extras):', err2);
      throw err2;
    }
    return;
  }
  if (error) {
    console.error('[Digital Guru] Erro ao inserir guru_sales:', error);
    throw error;
  }
}

// --- Webhook de assinaturas (Guru) ---
// Ref: https://docs.digitalmanager.guru/developers/webhook-para-assinaturas

export interface GuruSubscriptionInsert {
  subscription_id: string;
  internal_id?: string | null;
  subscription_code?: string | null;
  contact_id?: string | null;
  subscriber_email?: string | null;
  subscriber_name?: string | null;
  subscriber_doc?: string | null;
  subscriber_phone?: string | null;
  subscriber_phone_local_code?: string | null;
  subscriber_address?: string | null;
  subscriber_address_number?: string | null;
  subscriber_address_comp?: string | null;
  subscriber_address_district?: string | null;
  subscriber_address_city?: string | null;
  subscriber_address_state?: string | null;
  subscriber_address_zip_code?: string | null;
  subscriber_address_country?: string | null;
  last_status?: string | null;
  current_invoice_id?: string | null;
  current_invoice_cycle?: number | null;
  current_invoice_status?: string | null;
  current_invoice_charge_at?: string | null;
  current_invoice_value?: number | null;
  current_invoice_period_start?: string | null;
  current_invoice_period_end?: string | null;
  current_invoice_payment_url?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  offer_id?: string | null;
  offer_name?: string | null;
  next_cycle_at?: string | null;
  cycle_end_date?: string | null;
  cycle_start_date?: string | null;
  started_at?: string | null;
  last_status_at?: string | null;
  canceled_at?: string | null;
  cancel_at_cycle_end?: boolean | null;
  cancel_reason?: string | null;
  cancelled_by_name?: string | null;
  cancelled_by_email?: string | null;
  cancelled_by_date?: string | null;
  payment_method?: string | null;
  charged_every_days?: number | null;
  charged_times?: number | null;
  next_cycle_value?: number | null;
  is_overdue?: boolean;
  days_overdue?: number | null;
  overdue_since?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

function parseDateOnly(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? s.slice(0, 10) : null;
}

function parseIsoDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Parse do webhook de assinaturas do Digital Manager Guru.
 * Retorna objeto para upsert em guru_subscriptions e calcula is_overdue/days_overdue.
 */
export function parseGuruSubscriptionWebhook(body: Record<string, unknown>): GuruSubscriptionInsert | null {
  if (body.webhook_type !== 'subscription' || body.id == null) return null;
  const subscriptionId = typeof body.id === 'string' ? body.id : String(body.id);

  const subscriber = body.subscriber && typeof body.subscriber === 'object' ? (body.subscriber as Record<string, unknown>) : null;
  const currentInvoice = body.current_invoice && typeof body.current_invoice === 'object' ? (body.current_invoice as Record<string, unknown>) : null;
  const product = body.product && typeof body.product === 'object' ? (body.product as Record<string, unknown>) : null;
  const offer = product?.offer && typeof product.offer === 'object' ? (product.offer as Record<string, unknown>) : null;
  const dates = body.dates && typeof body.dates === 'object' ? (body.dates as Record<string, unknown>) : null;
  const cancelledBy = body.cancelled_by && typeof body.cancelled_by === 'object' ? (body.cancelled_by as Record<string, unknown>) : null;

  const email = subscriber ? normalizeEmail(subscriber.email as string | undefined) : '';
  const phoneLocal = subscriber ? String(subscriber.phone_local_code ?? '').trim() : '';
  const phoneNum = subscriber ? String(subscriber.phone_number ?? '').replace(/\D/g, '') : '';
  const phone = subscriber ? normalizePhone(phoneNum ? (phoneLocal + phoneNum) : (subscriber.phone_number as string)) : '';

  const chargeAt = currentInvoice ? parseDateOnly(currentInvoice.charge_at) : null;
  const invoiceStatus = currentInvoice && typeof currentInvoice.status === 'string' ? currentInvoice.status : null;
  let currentInvoiceValue: number | null = null;
  if (currentInvoice?.value != null) {
    const v = currentInvoice.value;
    currentInvoiceValue = typeof v === 'number' ? v : parseFloat(String(v)) || null;
  }
  let nextCycleValue: number | null = null;
  if (body.next_cycle_value != null) {
    const v = body.next_cycle_value;
    nextCycleValue = typeof v === 'number' ? v : parseFloat(String(v)) || null;
  }

  const row: GuruSubscriptionInsert = {
    subscription_id: subscriptionId,
    internal_id: body.internal_id != null ? String(body.internal_id) : null,
    subscription_code: body.subscription_code != null ? String(body.subscription_code) : null,
    subscriber_email: email || null,
    subscriber_name: subscriber && typeof subscriber.name === 'string' ? subscriber.name : null,
    subscriber_doc: subscriber && subscriber.doc != null ? String(subscriber.doc) : null,
    subscriber_phone: phone || null,
    subscriber_phone_local_code: phoneLocal || null,
    subscriber_address: subscriber && subscriber.address != null ? String(subscriber.address) : null,
    subscriber_address_number: subscriber && subscriber.address_number != null ? String(subscriber.address_number) : null,
    subscriber_address_comp: subscriber && subscriber.address_comp != null ? String(subscriber.address_comp) : null,
    subscriber_address_district: subscriber && subscriber.address_district != null ? String(subscriber.address_district) : null,
    subscriber_address_city: subscriber && subscriber.address_city != null ? String(subscriber.address_city) : null,
    subscriber_address_state: subscriber && subscriber.address_state != null ? String(subscriber.address_state) : null,
    subscriber_address_zip_code: subscriber && subscriber.address_zip_code != null ? String(subscriber.address_zip_code) : null,
    subscriber_address_country: subscriber && subscriber.address_country != null ? String(subscriber.address_country) : null,
    last_status: body.last_status != null ? String(body.last_status) : null,
    current_invoice_id: currentInvoice && currentInvoice.id != null ? String(currentInvoice.id) : null,
    current_invoice_cycle:
      currentInvoice && typeof currentInvoice.cycle === 'number'
        ? currentInvoice.cycle
        : currentInvoice?.cycle != null
          ? parseInt(String(currentInvoice.cycle), 10)
          : null,
    current_invoice_status: invoiceStatus,
    current_invoice_charge_at: chargeAt,
    current_invoice_value: currentInvoiceValue,
    current_invoice_period_start: currentInvoice ? parseDateOnly(currentInvoice.period_start) : null,
    current_invoice_period_end: currentInvoice ? parseDateOnly(currentInvoice.period_end) : null,
    current_invoice_payment_url: currentInvoice && typeof currentInvoice.payment_url === 'string' ? currentInvoice.payment_url : null,
    product_id: product && product.id != null ? String(product.id) : null,
    product_name: product && typeof product.name === 'string' ? product.name : null,
    offer_id: offer && offer.id != null ? String(offer.id) : null,
    offer_name: offer && typeof offer.name === 'string' ? offer.name : null,
    next_cycle_at: dates && dates.next_cycle_at != null ? parseDateOnly(dates.next_cycle_at) : null,
    cycle_end_date: dates && dates.cycle_end_date != null ? parseDateOnly(dates.cycle_end_date) : null,
    cycle_start_date: dates && dates.cycle_start_date != null ? parseDateOnly(dates.cycle_start_date) : null,
    started_at: dates && dates.started_at ? parseIsoDate(dates.started_at) : null,
    last_status_at: dates && dates.last_status_at ? parseIsoDate(dates.last_status_at) : null,
    canceled_at: dates && dates.canceled_at ? parseIsoDate(dates.canceled_at) : null,
    cancel_at_cycle_end: body.cancel_at_cycle_end === true || body.cancel_at_cycle_end === 1,
    cancel_reason: body.cancel_reason != null ? String(body.cancel_reason) : null,
    cancelled_by_name: cancelledBy && cancelledBy.name != null ? String(cancelledBy.name) : null,
    cancelled_by_email: cancelledBy && cancelledBy.email != null ? String(cancelledBy.email) : null,
    cancelled_by_date: cancelledBy && cancelledBy.date ? parseIsoDate(cancelledBy.date) : null,
    payment_method: body.payment_method != null ? String(body.payment_method) : null,
    charged_every_days: typeof body.charged_every_days === 'number' ? body.charged_every_days : null,
    charged_times: typeof body.charged_times === 'number' ? body.charged_times : null,
    next_cycle_value: nextCycleValue,
    raw_payload: body,
  };

  // Atraso: fatura não paga e data de cobrança já passou
  const paidStatuses = ['paid', 'approved'];
  const isPaid = invoiceStatus && paidStatuses.includes(invoiceStatus.toLowerCase());
  const today = diaEmBrasilia();
  if (!isPaid && chargeAt && chargeAt <= today) {
    const charge = new Date(chargeAt);
    const todayDate = new Date(today);
    const diffMs = todayDate.getTime() - charge.getTime();
    const daysOverdue = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    row.is_overdue = true;
    row.days_overdue = daysOverdue;
    row.overdue_since = chargeAt;
  } else {
    row.is_overdue = false;
    row.days_overdue = null;
    row.overdue_since = null;
  }

  return row;
}

/**
 * Garante contato para assinatura (busca por email/telefone ou cria). Retorna contact_id.
 */
export async function ensureContactForSubscription(
  email: string,
  phone: string,
  contactName?: string | null
): Promise<string | null> {
  if (!email && !phone) return null;
  const result = await applyParsedTransactionToContacts({
    email,
    phone,
    products: [],
    situation: 'subscription',
  });
  if (result.contact_ids.length > 0) return result.contact_ids[0];

  const externalId = email || (phone ? normalizePhoneCanonical(phone) : '') || phone;
  const name = contactName?.trim() || null;
  const digitalGuru: DigitalGuruMetadata = {
    is_student: true,
    products: [],
    situation: 'subscription',
    last_sync_at: new Date().toISOString(),
  };

  const { data: newContact, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      channel_type: 'guru',
      external_id: externalId,
      name: name || undefined,
      email: email || undefined,
      phone: phone || undefined,
      metadata: { digital_guru: digitalGuru },
    })
    .select('id')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      const { data: existing } = await supabaseAdmin
        .from('contacts')
        .select('id')
        .eq('channel_type', 'guru')
        .eq('external_id', externalId)
        .limit(1)
        .maybeSingle();
      return existing?.id ?? null;
    }
    return null;
  }
  return newContact?.id ?? null;
}

/** Upsert de assinatura na tabela guru_subscriptions (por subscription_id). */
export async function upsertGuruSubscription(row: GuruSubscriptionInsert): Promise<void> {
  const updatedAt = new Date().toISOString();
  const payload = {
    ...row,
    updated_at: updatedAt,
  };
  const { error } = await supabaseAdmin
    .from('guru_subscriptions')
    .upsert(payload, {
      onConflict: 'subscription_id',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error('[Digital Guru] Erro ao upsert guru_subscriptions:', error);
    throw error;
  }
}
