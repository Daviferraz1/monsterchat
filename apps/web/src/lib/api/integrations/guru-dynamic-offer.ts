/**
 * Link de checkout com desconto (oferta dinâmica da Guru), gerado pelo atendente.
 *
 * A oferta dinâmica é um registro na Guru que aponta para uma oferta de base e
 * troca o valor cobrado; o link é o checkout da oferta de base com `?settings={id}`.
 * Doc: https://api.docs.digitalmanager.guru/openapi/referencia-api/dynamic-offers.yaml
 *
 * Duas limitações da Guru, conferidas em 06/10/2026:
 *  - Assinatura (/subscribe/) não troca valor: "valores dinâmicos com as assinaturas,
 *    apenas no campo do contato". O checkout cobra o preço cheio. Para esses, cupom.
 *  - A oferta de base precisa estar ativa, senão o checkout mostra "Oferta não está ativa!".
 *
 * Reaproveitamento: um link por aluno, oferta e valor. `source` leva o contato e a
 * oferta, e antes de criar procuramos um registro igual nas ofertas mais recentes.
 */
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';

const API = 'https://digitalmanager.guru/api/v2';
const CACHE_KEY = 'guru_ofertas_por_link';

export interface OfertaBase {
  offerId: string;
  productId: string;
  nome: string;
  valor: number;
  checkoutUrl: string;
}

function headers(): Record<string, string> {
  const token = apiEnv.DIGITAL_GURU_USER_TOKEN;
  if (!token) throw new Error('DIGITAL_GURU_USER_TOKEN não configurado.');
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
}

async function guru<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Guru ${init?.method ?? 'GET'} ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Identificador do link de checkout: o último trecho do caminho, sem query. */
export function slugDoCheckout(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/$/, '').split('/').pop() ?? '';
  } catch {
    return '';
  }
}

export function ehAssinatura(url: string): boolean {
  return /\/subscribe\//.test(url);
}

type Cache = Record<string, OfertaBase>;

async function lerCache(): Promise<Cache> {
  const { data } = await supabaseAdmin.from('ia_settings').select('value').eq('key', CACHE_KEY).maybeSingle();
  return (data?.value as Cache | null) ?? {};
}

async function gravarCache(cache: Cache): Promise<void> {
  await supabaseAdmin.from('ia_settings').upsert({ key: CACHE_KEY, value: cache }, { onConflict: 'key' });
}

interface GuruLista<T> {
  data?: T[];
  next_cursor?: string | null;
}
interface GuruProduto {
  id: string;
  name: string;
}
interface GuruOferta {
  id: string;
  name?: string;
  value?: number;
  checkout_url?: string;
  is_active?: number | boolean;
}

/**
 * Acha na Guru a oferta por trás de um link de checkout. A API não busca por link,
 * então varre produtos e ofertas uma vez e guarda o mapa inteiro em ia_settings.
 * O preço vem sempre ao vivo da oferta, porque é ele que o desconto toma por base.
 */
export async function acharOfertaBase(checkoutUrl: string): Promise<OfertaBase | null> {
  const slug = slugDoCheckout(checkoutUrl);
  if (!slug) return null;
  const cache = await lerCache();

  const ofertaAoVivo = async (base: OfertaBase): Promise<OfertaBase | null> => {
    try {
      const ofertas = await guru<GuruLista<GuruOferta>>(`/products/${base.productId}/offers?per_page=50`);
      const o = (ofertas.data ?? []).find((x) => x.id === base.offerId);
      return o ? { ...base, valor: Number(o.value ?? base.valor) } : null;
    } catch {
      return null;
    }
  };

  if (cache[slug]) {
    const viva = await ofertaAoVivo(cache[slug]);
    if (viva) return viva;
  }

  const novo: Cache = {};
  let cursor = '';
  for (let pagina = 0; pagina < 20; pagina++) {
    const lista = await guru<GuruLista<GuruProduto>>(`/products?per_page=50${cursor ? `&cursor=${cursor}` : ''}`);
    const produtos = lista.data ?? [];
    for (let i = 0; i < produtos.length; i += 5) {
      await Promise.all(
        produtos.slice(i, i + 5).map(async (p) => {
          const ofertas = await guru<GuruLista<GuruOferta>>(`/products/${p.id}/offers?per_page=50`).catch(() => ({ data: [] }));
          for (const o of ofertas.data ?? []) {
            const s = o.checkout_url ? slugDoCheckout(o.checkout_url) : '';
            if (!s) continue;
            novo[s] = { offerId: o.id, productId: p.id, nome: p.name, valor: Number(o.value ?? 0), checkoutUrl: o.checkout_url!.split('?')[0] };
          }
        })
      );
    }
    cursor = lista.next_cursor ?? '';
    if (!cursor) break;
  }
  await gravarCache(novo);
  return novo[slug] ?? null;
}

export interface ContatoOferta {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
}

interface GuruDynamicOffer {
  id: string;
  value?: number;
  source?: string | null;
  url?: string;
}

/** Arredonda para centavos (a Guru guarda o valor como número decimal). */
export function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

export async function gerarLinkComDesconto(params: {
  base: OfertaBase;
  valor: number;
  contactId: string;
  contato: ContatoOferta;
}): Promise<{ link: string; id: string; reaproveitado: boolean }> {
  const valor = centavos(params.valor);
  // A listagem da Guru não devolve a oferta de base (url vem nula), então ela vai no source.
  const source = `monsterchat:${params.contactId}:${params.base.offerId}`;
  const linkDe = (id: string) => `${params.base.checkoutUrl}?settings=${id}`;

  // Mesmo aluno, mesma oferta, mesmo valor: devolve o link que já existe.
  let cursor = '';
  for (let pagina = 0; pagina < 3; pagina++) {
    const lista = await guru<GuruLista<GuruDynamicOffer>>(`/dynamic-offers${cursor ? `?cursor=${cursor}` : ''}`);
    const igual = (lista.data ?? []).find(
      (d) => d.source === source && centavos(Number(d.value)) === valor
    );
    if (igual) return { link: linkDe(igual.id), id: igual.id, reaproveitado: true };
    cursor = lista.next_cursor ?? '';
    if (!cursor) break;
  }

  const fone = (params.contato.telefone ?? '').replace(/\D/g, '');
  const contact: Record<string, string> = {};
  if (params.contato.nome) contact.name = params.contato.nome;
  if (params.contato.email) contact.email = params.contato.email;
  if (fone.length >= 10) {
    contact.phone_local_code = '55';
    contact.phone_number = fone.startsWith('55') && fone.length >= 12 ? fone.slice(2) : fone;
  }

  const criada = await guru<GuruDynamicOffer>('/dynamic-offers', {
    method: 'POST',
    body: JSON.stringify({
      offer_id: params.base.offerId,
      value: valor,
      product_name: params.base.nome,
      product_qty: 1,
      source,
      blocked: 0,
      ...(Object.keys(contact).length ? { contact } : {}),
    }),
  });
  if (!criada?.id) throw new Error('A Guru não devolveu o id da oferta dinâmica.');
  return { link: linkDe(criada.id), id: criada.id, reaproveitado: false };
}
