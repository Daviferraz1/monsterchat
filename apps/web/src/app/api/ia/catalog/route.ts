import { NextRequest, NextResponse } from 'next/server';
import { getCatalogJSON, listProducts, createProduct } from '@/lib/api/ia/catalog';
import type { ProductRow } from '@/lib/api/ia/catalog';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format');
    if (format === 'json') {
      const json = await getCatalogJSON();
      return NextResponse.json({ catalog: json });
    }
    const brand = searchParams.get('brand') || undefined;
    const status = searchParams.get('status') || undefined;
    const isActive =
      searchParams.get('is_active') === 'true'
        ? true
        : searchParams.get('is_active') === 'false'
          ? false
          : undefined;
    const items = await listProducts({ brand, status, is_active: isActive });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[API ia/catalog] GET', err);
    return NextResponse.json({ error: 'Falha ao listar catálogo' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const row = {
      brand: body.brand as string,
      name: body.name as string,
      slug: body.slug ?? null,
      category: body.category ?? null,
      description: body.description ?? null,
      target_exam: body.target_exam ?? null,
      target_role: body.target_role ?? null,
      product_type: body.product_type === 'subscription' ? 'subscription' : 'one_time',
      price_display: body.price_display as string,
      price_cents: body.price_cents ?? null,
      price_recurring_display: body.price_recurring_display ?? null,
      price_recurring_cents: body.price_recurring_cents ?? null,
      checkout_url: body.checkout_url as string,
      checkout_url_subscription: body.checkout_url_subscription ?? null,
      sales_page_url: body.sales_page_url ?? null,
      includes: body.includes ?? null,
      duration: body.duration ?? null,
      status: (body.status as string) || 'available',
      highlights: body.highlights ?? null,
      notes: body.notes ?? null,
      extra_info_for_ia: body.extra_info_for_ia ?? null,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
      is_active: body.is_active !== false,
    } as Omit<ProductRow, 'id' | 'created_at' | 'updated_at'>;
    const product = await createProduct(row);
    return NextResponse.json(product);
  } catch (err) {
    console.error('[API ia/catalog] POST', err);
    return NextResponse.json({ error: 'Falha ao criar produto' }, { status: 500 });
  }
}
