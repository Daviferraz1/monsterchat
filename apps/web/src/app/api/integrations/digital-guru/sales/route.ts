import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/integrations/digital-guru/sales
 *
 * Retorna as últimas vendas registradas (para o painel do atendente).
 * Query: limit (default 50), offset (default 0), status (opcional: approved, paid, pending, refused, cancelled, refused_or_cancelled).
 * Inclui conversation_id quando o comprador tem contato no MonsterChat (uma conversa qualquer do contato).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100);
    const offset = Number(searchParams.get('offset')) || 0;
    const statusParam = searchParams.get('status')?.toLowerCase().trim() || '';

    let query = supabaseAdmin
      .from('guru_sales')
      .select('id, transaction_id, contact_email, contact_phone, contact_name, product_names, status, sold_at, contact_id, created_at');

    if (statusParam === 'refused_or_cancelled') {
      query = query.in('status', ['refused', 'cancelled']);
    } else if (statusParam) {
      query = query.eq('status', statusParam);
    }

    const { data: sales, error: salesError } = await query
      .order('sold_at', { ascending: false })
      .range(offset, offset + limit - 1);

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
      conversation_id: s.contact_id ? conversationByContact[s.contact_id] ?? null : null,
      created_at: s.created_at,
    }));

    return NextResponse.json({
      sales: list,
      total: list.length,
    });
  } catch (error) {
    console.error('[Digital Guru sales] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao listar vendas' },
      { status: 500 }
    );
  }
}
