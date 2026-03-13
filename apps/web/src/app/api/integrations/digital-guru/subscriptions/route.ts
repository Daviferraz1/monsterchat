import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COLS =
  'id, subscription_id, internal_id, subscription_code, contact_id, subscriber_email, subscriber_name, subscriber_doc, subscriber_phone, subscriber_phone_local_code, subscriber_address, subscriber_address_number, subscriber_address_comp, subscriber_address_district, subscriber_address_city, subscriber_address_state, subscriber_address_zip_code, subscriber_address_country, last_status, current_invoice_id, current_invoice_status, current_invoice_charge_at, current_invoice_value, current_invoice_period_start, current_invoice_period_end, current_invoice_payment_url, product_id, product_name, offer_id, offer_name, next_cycle_at, cycle_end_date, cycle_start_date, started_at, last_status_at, canceled_at, cancel_at_cycle_end, cancel_reason, cancelled_by_name, cancelled_by_email, cancelled_by_date, payment_method, charged_every_days, charged_times, next_cycle_value, is_overdue, days_overdue, overdue_since, created_at, updated_at';

/**
 * GET /api/integrations/digital-guru/subscriptions
 *
 * Lista assinaturas Guru para o dashboard. Query: limit, offset, overdue (true|false), status (last_status), search (email, nome, telefone, doc).
 * Retorna stats (total, overdue_count, active_count) e lista de assinaturas com conversation_id quando há contato.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const offset = Number(searchParams.get('offset')) || 0;
    const overdueOnly = searchParams.get('overdue') === 'true';
    const statusParam = (searchParams.get('status') ?? '').toLowerCase().trim();
    const searchParam = searchParams.get('search')?.trim() || '';
    const contactIdParam = searchParams.get('contact_id')?.trim() || '';

    // Stats: total e em atraso
    const { count: totalCount } = await supabaseAdmin
      .from('guru_subscriptions')
      .select('*', { count: 'exact', head: true });

    const { count: overdueCount } = await supabaseAdmin
      .from('guru_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('is_overdue', true);

    const { count: activeCount } = await supabaseAdmin
      .from('guru_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('last_status', 'active');

    let q = supabaseAdmin.from('guru_subscriptions').select(COLS);
    if (overdueOnly) q = q.eq('is_overdue', true);
    if (statusParam) q = q.ilike('last_status', statusParam);
    if (contactIdParam) q = q.eq('contact_id', contactIdParam);
    if (searchParam.length >= 2) {
      const escaped = searchParam.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      const digits = searchParam.replace(/\D/g, '');
      const orParts = [
        `subscriber_email.ilike.%${escaped}%`,
        `subscriber_name.ilike.%${escaped}%`,
        `subscriber_doc.ilike.%${escaped}%`,
        `subscriber_phone.ilike.%${escaped}%`,
        `product_name.ilike.%${escaped}%`,
      ];
      if (digits.length >= 2) orParts.push(`subscriber_phone.ilike.%${digits}%`);
      q = q.or(orParts.join(','));
    }
    const { data: rows, error } = await q
      .order('is_overdue', { ascending: false })
      .order('overdue_since', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Digital Guru subscriptions] Erro:', error);
      return NextResponse.json(
        { error: 'Erro ao buscar assinaturas', detail: error.message },
        { status: 500 }
      );
    }

    const subscriptions = (rows || []) as Array<Record<string, unknown>>;
    const contactIds = [...new Set(subscriptions.map((s) => s.contact_id).filter(Boolean))] as string[];
    let conversationByContact: Record<string, string> = {};
    if (contactIds.length > 0) {
      const { data: convs } = await supabaseAdmin
        .from('conversations')
        .select('id, contact_id')
        .in('contact_id', contactIds);
      if (convs?.length) {
        for (const c of convs) {
          if (c.contact_id && !conversationByContact[c.contact_id]) {
            conversationByContact[c.contact_id] = c.id;
          }
        }
      }
    }

    const list = subscriptions.map((s) => ({
      ...s,
      conversation_id: s.contact_id ? conversationByContact[s.contact_id as string] ?? null : null,
    }));

    return NextResponse.json({
      subscriptions: list,
      stats: {
        total: totalCount ?? 0,
        overdue_count: overdueCount ?? 0,
        active_count: activeCount ?? 0,
      },
    });
  } catch (err) {
    console.error('[Digital Guru subscriptions] Erro:', err);
    return NextResponse.json(
      { error: 'Erro ao listar assinaturas' },
      { status: 500 }
    );
  }
}
