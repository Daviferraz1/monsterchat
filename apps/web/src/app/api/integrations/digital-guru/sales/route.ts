import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/integrations/digital-guru/sales
 *
 * Retorna as últimas vendas registradas (para o painel do atendente).
 * Query: limit (default 50), offset (default 0), status (opcional), search (opcional: busca por e-mail, telefone ou nome).
 * Inclui conversation_id quando o comprador tem contato no MonsterChat (uma conversa qualquer do contato).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const statusParam = (searchParams.get('status') ?? '').toLowerCase().trim();
    const searchParam = searchParams.get('search')?.trim() || '';
    const contactIdParam = searchParams.get('contact_id')?.trim() || '';

    // Sem filtro de status ("Todos"): retornar todas (até 1000). Com filtro: 50–100.
    const limit = statusParam
      ? Math.min(Number(limitParam) || 50, 100)
      : Math.min(Number(limitParam) || 500, 1000);
    const offset = Number(searchParams.get('offset')) || 0;

    const columnsBase = 'id, transaction_id, contact_email, contact_phone, contact_name, product_names, status, sold_at, contact_id, created_at';
    const columnsWithDetails = `${columnsBase}, payment_method, payment_total, address_full`;

    let query = supabaseAdmin
      .from('guru_sales')
      .select(columnsWithDetails);

    let sales: Array<Record<string, unknown>> | null = null;
    let salesError: { message: string } | null = null;
    let useDetails = true;

    const runQuery = async (cols: string) => {
      let q = supabaseAdmin.from('guru_sales').select(cols);
      if (statusParam === 'refused_or_cancelled') {
        q = q.in('status', ['refused', 'cancelled']);
      } else if (statusParam && statusParam !== 'all') {
        q = q.ilike('status', statusParam);
      }
      if (contactIdParam) q = q.eq('contact_id', contactIdParam);
      if (searchParam.length >= 2) {
        const escaped = searchParam.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
        const digits = searchParam.replace(/\D/g, '');
        const orParts = [
          `contact_email.ilike.%${escaped}%`,
          `contact_name.ilike.%${escaped}%`,
          `contact_phone.ilike.%${escaped}%`,
        ];
        if (digits.length >= 2) orParts.push(`contact_phone.ilike.%${digits}%`);
        q = q.or(orParts.join(','));
      }
      return q.order('sold_at', { ascending: false }).range(offset, offset + limit - 1);
    };

    const result = await runQuery(columnsWithDetails);
    sales = result.data as Array<Record<string, unknown>> | null;
    salesError = result.error;

    if (salesError && /column|does not exist/i.test(String((salesError as { message?: string }).message ?? ''))) {
      const fallback = await runQuery(columnsBase);
      sales = fallback.data as Array<Record<string, unknown>> | null;
      salesError = fallback.error;
      useDetails = false;
    }

    if (salesError) {
      console.error('[Digital Guru sales] Erro:', salesError);
      return NextResponse.json(
        { error: 'Erro ao buscar vendas', detail: salesError.message },
        { status: 500 }
      );
    }

    const contactIds = [...new Set((sales || []).map((s) => s.contact_id).filter(Boolean))] as string[];
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

    const list = (sales || []).map((s) => ({
      id: s.id,
      transaction_id: s.transaction_id,
      contact_email: s.contact_email,
      contact_phone: s.contact_phone,
      contact_name: s.contact_name,
      product_names: s.product_names,
      status: s.status,
      sold_at: s.sold_at,
      contact_id: s.contact_id,
      payment_method: useDetails ? (s.payment_method ?? null) : null,
      payment_total: useDetails ? (s.payment_total ?? null) : null,
      address_full: useDetails ? (s.address_full ?? null) : null,
      conversation_id: s.contact_id ? conversationByContact[s.contact_id as string] ?? null : null,
      created_at: s.created_at,
    }));

    // Uma transação não deve aparecer duplicada (ex.: mesma compra inserida 2x ou por item)
    const seenKeys = new Set<string>();
    const deduped = list.filter((s) => {
      const key =
        s.contact_id && s.transaction_id
          ? `${s.contact_id}:${s.transaction_id}`
          : (s.id as string);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    return NextResponse.json({
      sales: deduped,
      total: deduped.length,
    });
  } catch (error) {
    console.error('[Digital Guru sales] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao listar vendas' },
      { status: 500 }
    );
  }
}
