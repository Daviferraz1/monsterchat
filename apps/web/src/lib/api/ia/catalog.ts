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

/** Normaliza texto para comparação (minúsculo, sem acentos). */
function normalizeForMatch(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/** Palavras que não identificam qual produto (evita match por "curso", "valor", etc.). */
const STOPWORDS = new Set([
  'qual', 'oque', 'o', 'a', 'um', 'uma', 'valor', 'preco', 'preço', 'do', 'da', 'de', 'para', 'aluno',
  'curso', 'cursos', 'quero', 'saber', 'informacao', 'informações', 'quanto', 'custa', 'valor do',
  'preparatorio', 'preparatório', 'concurso', 'concursos', 'vagas', 'edital', 'inscricao',
]);

/** Palavras que indicam apenas estado/região; match só nelas não é suficiente (evita sugerir Guarda MG quando o lead pede Bombeiro MG). */
const STATE_WORDS = new Set([
  'minas', 'mg', 'gerais', 'sp', 'paulista', 'rj', 'janeiro', 'ba', 'bahia', 'go', 'goias', 'goiás',
  'pr', 'parana', 'paraná', 'sc', 'catarina', 'rs', 'sul', 'pe', 'pernambuco', 'ce', 'ceara', 'df', 'brasilia',
]);

/**
 * Retorna produtos do catálogo cujo nome, concurso ou cargo batem na mensagem.
 * Melhora de precisão: ignora stopwords; exige match em cargo/concurso (não só em estado);
 * pontua e ordena por relevância para sugerir o curso certo (ex.: bombeiro militar de minas → curso de bombeiro, não guarda municipal).
 */
export async function getMatchingProducts(
  messageBody: string,
  brand?: string
): Promise<ProductRow[]> {
  if (!messageBody?.trim()) return [];
  const text = normalizeForMatch(messageBody);
  const allWords = text.split(/\s+/).filter((w) => w.length >= 2);
  const contentWords = allWords.filter((w) => !STOPWORDS.has(w));
  const wordsToUse = contentWords.length >= 1 ? contentWords : allWords;
  if (wordsToUse.length === 0) return [];

  const products = await listProducts({ is_active: true, brand: brand || undefined });
  const scored: { product: ProductRow; score: number; onlyState: boolean }[] = [];

  for (const p of products) {
    const nameNorm = normalizeForMatch(p.name);
    const slugNorm = p.slug ? normalizeForMatch(p.slug) : '';
    const examNorm = p.target_exam ? normalizeForMatch(p.target_exam) : '';
    const roleNorm = p.target_role ? normalizeForMatch(p.target_role) : '';
    const productText = [nameNorm, slugNorm, examNorm, roleNorm].filter(Boolean).join(' ');

    const fullPhraseMatch =
      (nameNorm.length >= 8 && text.includes(nameNorm)) ||
      (examNorm.length >= 6 && text.includes(examNorm)) ||
      (roleNorm.length >= 6 && text.includes(roleNorm));
    if (fullPhraseMatch) {
      scored.push({ product: p, score: 10, onlyState: false });
      continue;
    }

    let score = 0;
    let onlyState = true;
    for (const w of wordsToUse) {
      if (!productText.includes(w)) continue;
      score += 1;
      if (!STATE_WORDS.has(w)) onlyState = false;
    }

    if (score === 0) continue;
    if (onlyState && score < 2) continue;
    scored.push({ product: p, score, onlyState });
  }

  scored.sort((a, b) => {
    if (a.onlyState !== b.onlyState) return a.onlyState ? 1 : -1;
    return b.score - a.score;
  });
  return scored.map((s) => s.product);
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
