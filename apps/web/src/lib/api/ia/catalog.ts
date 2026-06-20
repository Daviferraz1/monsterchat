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

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, 'i').test(text);
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

  const askedTecnologo = hasWord(text, 'tecnologo');
  const askedSequencial = hasWord(text, 'sequencial');

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

    // Prioriza tipo de curso explicitamente citado pelo aluno.
    if (askedTecnologo) {
      if (hasWord(nameNorm, 'tecnologo')) score += 6;
      else score -= 4;
    }
    if (askedSequencial) {
      if (hasWord(nameNorm, 'sequencial')) score += 6;
      else score -= 4;
    }

    if (onlyState && score < 2) continue;
    if (score <= 0) continue;
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

/* ===================== Importação em massa (upsert) ===================== */

type ProductPayload = Omit<ProductRow, 'id' | 'created_at' | 'updated_at'>;

interface NormalizedProduct {
  payload: ProductPayload;
  matchSlug: string | null;
  matchCheckout: string;
  matchName: string;
  matchBrand: string;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  errors: string[];
}

/** "R$ 2.997,00" / "R$ 390,00 por mês" -> centavos (29970000? não: 299700). Pega o 1º valor. */
function parseBRLToCents(text?: string | null): number | null {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(/(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/);
  if (!m) return null;
  const reais = parseInt(m[1].replace(/\./g, ''), 10);
  if (isNaN(reais)) return null;
  const cents = m[2] ? parseInt(m[2], 10) : 0;
  return reais * 100 + cents;
}

function normalizeBrand(v: unknown): 'monster' | 'fagenius' {
  return String(v ?? '').trim().toLowerCase() === 'fagenius' ? 'fagenius' : 'monster';
}

function joinIncludes(inclui: unknown): string | null {
  if (Array.isArray(inclui)) return inclui.filter(Boolean).join('\n') || null;
  if (typeof inclui === 'string') return inclui.trim() || null;
  return null;
}

function formatHighlights(destaques: unknown): string | null {
  if (typeof destaques === 'string') return destaques.trim() || null;
  if (destaques && typeof destaques === 'object') {
    const parts = Object.entries(destaques as Record<string, unknown>)
      .filter(([, v]) => v != null && String(v).trim() !== '')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
    return parts.length ? parts.join(' | ') : null;
  }
  return null;
}

function buildCourseExtraInfo(course: Record<string, any>): string | null {
  const parts: string[] = [];
  const info = course.informacoes_para_ia;
  if (typeof info === 'string' && info.trim()) {
    parts.push(info.trim());
  } else if (info && typeof info === 'object' && Array.isArray(info.perguntas_frequentes)) {
    const faq = info.perguntas_frequentes
      .map((q: any) => `P: ${q?.pergunta ?? ''}\nR: ${q?.resposta ?? ''}`)
      .filter((s: string) => s.replace(/^P:\s*\nR:\s*$/, '').trim())
      .join('\n');
    if (faq) parts.push(faq);
  }
  if (typeof course.cadastro_mec === 'string' && course.cadastro_mec.trim()) {
    parts.push(`Cadastro MEC: ${course.cadastro_mec.trim()}`);
  }
  const out = parts.join('\n\n').trim();
  return out ? out.slice(0, 4000) : null;
}

function buildPriceDisplay(preco: unknown): string {
  if (preco && typeof preco === 'object') {
    const p = preco as Record<string, unknown>;
    if (p.a_vista) {
      let s = String(p.a_vista);
      if (p.parcelamento) s += ` (ou ${p.parcelamento})`;
      return s;
    }
    if (p.observacao) return String(p.observacao);
  }
  return 'Consultar na página de vendas';
}

function looksLikeCourse(item: Record<string, any>): boolean {
  return !!(item && (item.nome || item.provedor || item.links || item.preco || item.concurso));
}

/** Mapeia um curso (formato cursos.json) para o payload da tabela products. */
function mapCourseToPayload(course: Record<string, any>, index: number): NormalizedProduct {
  const brand = normalizeBrand(course.provedor);
  const links = (course.links ?? {}) as Record<string, any>;
  const checkout = String(links.principal ?? course.checkout_url ?? course.pagina_vendas ?? '').trim();
  const name = String(course.nome ?? course.name ?? '').trim();
  const tipo = String(course.tipo ?? '').toUpperCase();
  const payload: ProductPayload = {
    brand,
    name,
    slug: (course.id ?? course.slug ?? null) as string | null,
    category: course.tipo ? String(course.tipo).toLowerCase() : (course.category ?? null),
    description: course.description ?? null,
    target_exam: course.concurso?.nome ?? course.target_exam ?? null,
    target_role: course.concurso?.cargo ?? course.target_role ?? null,
    product_type: tipo === 'ASSINATURA' || links.assinatura_mensal ? 'subscription' : 'one_time',
    price_display: buildPriceDisplay(course.preco),
    price_cents: parseBRLToCents(course.preco?.a_vista),
    price_recurring_display: course.preco?.recorrencia ?? null,
    price_recurring_cents: parseBRLToCents(course.preco?.recorrencia),
    checkout_url: checkout,
    checkout_url_subscription: links.assinatura_mensal ?? null,
    sales_page_url: course.pagina_vendas ?? null,
    includes: joinIncludes(course.inclui),
    duration: course.duracao ?? null,
    status: 'available',
    highlights: formatHighlights(course.destaques),
    notes: null,
    extra_info_for_ia: buildCourseExtraInfo(course),
    sort_order: index,
    is_active: true,
  };
  return { payload, matchSlug: payload.slug, matchCheckout: checkout, matchName: name.toLowerCase(), matchBrand: brand };
}

/** Mapeia um item já no formato nativo da tabela products. */
function mapNativeToPayload(item: Record<string, any>, index: number): NormalizedProduct {
  const brand = normalizeBrand(item.brand);
  const checkout = String(item.checkout_url ?? '').trim();
  const name = String(item.name ?? '').trim();
  const payload: ProductPayload = {
    brand,
    name,
    slug: (item.slug ?? null) as string | null,
    category: item.category ?? null,
    description: item.description ?? null,
    target_exam: item.target_exam ?? null,
    target_role: item.target_role ?? null,
    product_type: item.product_type === 'subscription' ? 'subscription' : 'one_time',
    price_display: String(item.price_display ?? '').trim() || 'Consultar na página de vendas',
    price_cents: typeof item.price_cents === 'number' ? item.price_cents : parseBRLToCents(item.price_display),
    price_recurring_display: item.price_recurring_display ?? null,
    price_recurring_cents: typeof item.price_recurring_cents === 'number' ? item.price_recurring_cents : null,
    checkout_url: checkout,
    checkout_url_subscription: item.checkout_url_subscription ?? null,
    sales_page_url: item.sales_page_url ?? null,
    includes: joinIncludes(item.includes),
    duration: item.duration ?? null,
    status: typeof item.status === 'string' ? item.status : 'available',
    highlights: typeof item.highlights === 'string' ? item.highlights : formatHighlights(item.highlights),
    notes: item.notes ?? null,
    extra_info_for_ia: item.extra_info_for_ia ?? null,
    sort_order: typeof item.sort_order === 'number' ? item.sort_order : index,
    is_active: item.is_active !== false,
  };
  return { payload, matchSlug: payload.slug, matchCheckout: checkout, matchName: name.toLowerCase(), matchBrand: brand };
}

/**
 * Importa uma lista de cursos/produtos com UPSERT.
 * Casa com produtos existentes por slug (o `id` do cursos.json), depois link de
 * checkout, depois marca+nome. Atualiza os campos mapeados dos existentes
 * (preservando status, is_active, sort_order e notes) e insere os novos.
 */
export async function importCatalog(items: Array<Record<string, any>>): Promise<ImportResult> {
  const result: ImportResult = { total: items.length, created: 0, updated: 0, errors: [] };

  const { data: existing, error: listErr } = await supabaseAdmin
    .from('products')
    .select('id, slug, name, brand, checkout_url');
  if (listErr) {
    result.errors.push(`Falha ao ler catálogo atual: ${listErr.message}`);
    return result;
  }
  const existingRows = (existing ?? []) as Array<{
    id: string;
    slug: string | null;
    name: string;
    brand: string;
    checkout_url: string;
  }>;

  for (let i = 0; i < items.length; i++) {
    try {
      const item = items[i];
      if (!item || typeof item !== 'object') {
        result.errors.push(`Item ${i + 1}: formato inválido.`);
        continue;
      }
      const norm = looksLikeCourse(item) ? mapCourseToPayload(item, i) : mapNativeToPayload(item, i);
      if (!norm.payload.name) {
        result.errors.push(`Item ${i + 1}: sem nome.`);
        continue;
      }
      if (!norm.payload.checkout_url) {
        result.errors.push(`Item ${i + 1} (${norm.payload.name}): sem link de checkout.`);
        continue;
      }

      const match = existingRows.find(
        (e) =>
          (norm.matchSlug && e.slug && e.slug === norm.matchSlug) ||
          (norm.matchCheckout && e.checkout_url && e.checkout_url === norm.matchCheckout) ||
          (e.brand === norm.matchBrand && (e.name ?? '').trim().toLowerCase() === norm.matchName)
      );

      if (match) {
        const upd = {
          brand: norm.payload.brand,
          name: norm.payload.name,
          slug: norm.payload.slug,
          category: norm.payload.category,
          target_exam: norm.payload.target_exam,
          target_role: norm.payload.target_role,
          product_type: norm.payload.product_type,
          price_display: norm.payload.price_display,
          price_cents: norm.payload.price_cents,
          price_recurring_display: norm.payload.price_recurring_display,
          price_recurring_cents: norm.payload.price_recurring_cents,
          checkout_url: norm.payload.checkout_url,
          checkout_url_subscription: norm.payload.checkout_url_subscription,
          sales_page_url: norm.payload.sales_page_url,
          includes: norm.payload.includes,
          duration: norm.payload.duration,
          highlights: norm.payload.highlights,
          extra_info_for_ia: norm.payload.extra_info_for_ia,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabaseAdmin.from('products').update(upd).eq('id', match.id);
        if (error) {
          result.errors.push(`${norm.payload.name}: ${error.message}`);
          continue;
        }
        result.updated++;
        if (norm.payload.slug) match.slug = norm.payload.slug; // dedup intra-importação
      } else {
        const { data, error } = await supabaseAdmin
          .from('products')
          .insert({ ...norm.payload, updated_at: new Date().toISOString() })
          .select('id, slug, name, brand, checkout_url')
          .single();
        if (error) {
          result.errors.push(`${norm.payload.name}: ${error.message}`);
          continue;
        }
        result.created++;
        if (data) existingRows.push(data as (typeof existingRows)[number]);
      }
    } catch (e) {
      result.errors.push(`Item ${i + 1}: ${e instanceof Error ? e.message : 'erro'}`);
    }
  }

  return result;
}
