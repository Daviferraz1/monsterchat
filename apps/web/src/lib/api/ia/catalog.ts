import { supabaseAdmin } from '../supabase';

export interface ProductRow {
  id: string;
  brand: string;
  name: string;
  slug: string | null;
  category: string | null;
  description: string | null;
  target_exam: string | null;
  target_role: string | null;
  product_type: 'one_time' | 'subscription';
  price_display: string;
  price_cents: number | null;
  price_recurring_display: string | null;
  price_recurring_cents: number | null;
  checkout_url: string;
  checkout_url_subscription: string | null;
  sales_page_url: string | null;
  includes: string | null;
  duration: string | null;
  status: string;
  highlights: string | null;
  notes: string | null;
  extra_info_for_ia: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Gera o JSON do catálogo para o system prompt da IA (apenas produtos ativos).
 */
export async function getCatalogJSON(): Promise<string> {
  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('brand')
    .order('sort_order');

  if (error) {
    console.error('[IA catalog] getCatalogJSON:', error);
    return 'Catálogo indisponível.';
  }
  if (!products || products.length === 0) return 'Catálogo vazio.';

  return (products as ProductRow[])
    .map((p) => {
      const isSubscription = p.product_type === 'subscription';
      const lines = [
        `• ${p.name} (${p.brand.toUpperCase()})${isSubscription ? ' [ASSINATURA]' : ''}`,
        `  Preço à vista: ${p.price_display}${p.price_recurring_display ? ` | Recorrência: ${p.price_recurring_display}` : ''}`,
        `  Link (à vista / principal): ${p.checkout_url}`,
      ];
      if (p.checkout_url_subscription?.trim())
        lines.push(`  Link (assinatura mensal): ${p.checkout_url_subscription.trim()}`);
      if (p.target_exam)
        lines.push(`  Concurso: ${p.target_exam}${p.target_role ? ' — ' + p.target_role : ''}`);
      if (p.includes) lines.push(`  Inclui: ${p.includes}`);
      if (p.duration) lines.push(`  Duração: ${p.duration}`);
      if (p.status !== 'available')
        lines.push(
          `  ⚠️ Status: ${p.status === 'coming_soon' ? 'Em breve' : p.status === 'sold_out' ? 'Esgotado' : p.status}`
        );
      if (p.highlights) lines.push(`  ★ ${p.highlights}`);
      if (p.extra_info_for_ia?.trim())
        lines.push(`  Informações para a IA: ${p.extra_info_for_ia.trim()}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

export async function listProducts(filters?: { brand?: string; status?: string; is_active?: boolean }) {
  let q = supabaseAdmin.from('products').select('*').order('brand').order('sort_order');
  if (filters?.brand) q = q.eq('brand', filters.brand);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.is_active !== undefined) q = q.eq('is_active', filters.is_active);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

export async function getProduct(id: string) {
  const { data, error } = await supabaseAdmin.from('products').select('*').eq('id', id).single();
  if (error) throw error;
  return data as ProductRow;
}

export async function createProduct(row: Omit<ProductRow, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      ...row,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProductRow;
}

export async function updateProduct(
  id: string,
  updates: Partial<Omit<ProductRow, 'id' | 'created_at'>>
) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as ProductRow;
}

export async function deleteProduct(id: string) {
  const { error } = await supabaseAdmin.from('products').delete().eq('id', id);
  if (error) throw error;
}
