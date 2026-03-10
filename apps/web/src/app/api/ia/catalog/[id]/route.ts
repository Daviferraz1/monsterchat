import { NextRequest, NextResponse } from 'next/server';
import { getProduct, updateProduct, deleteProduct } from '@/lib/api/ia/catalog';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await getProduct(id);
    return NextResponse.json(product);
  } catch (err) {
    console.error('[API ia/catalog/:id] GET', err);
    return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    const allowed = [
      'brand', 'name', 'slug', 'category', 'description', 'target_exam', 'target_role',
      'product_type', 'price_display', 'price_cents', 'price_recurring_display', 'price_recurring_cents',
      'checkout_url', 'checkout_url_subscription', 'sales_page_url', 'includes', 'duration',
      'status', 'highlights', 'notes', 'extra_info_for_ia', 'sort_order', 'is_active',
    ];
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }
    if ('product_type' in updates)
      updates.product_type = updates.product_type === 'subscription' ? 'subscription' : 'one_time';
    const product = await updateProduct(id, updates as any);
    return NextResponse.json(product);
  } catch (err) {
    console.error('[API ia/catalog/:id] PATCH', err);
    return NextResponse.json({ error: 'Falha ao atualizar produto' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteProduct(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API ia/catalog/:id] DELETE', err);
    return NextResponse.json({ error: 'Falha ao excluir produto' }, { status: 500 });
  }
}
