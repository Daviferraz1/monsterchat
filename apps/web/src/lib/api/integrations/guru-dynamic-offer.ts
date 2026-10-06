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
import { createHash } from 'crypto';
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
  /** Assinatura: quantas cobranças (6 no combo mensal, 1 no à vista) e de quanto em quanto tempo. */
  ciclos?: number;
  intervalo?: 'month' | 'year' | string;
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
  plan?: { cycles?: number; interval_type?: string };
}

function planoDa(o: GuruOferta): Pick<OfertaBase, 'ciclos' | 'intervalo'> {
  return o.plan ? { ciclos: Number(o.plan.cycles ?? 0), intervalo: o.plan.interval_type } : {};
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
      return o ? { ...base, valor: Number(o.value ?? base.valor), ...planoDa(o) } : null;
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
            novo[s] = {
              offerId: o.id,
              productId: p.id,
              nome: p.name,
              valor: Number(o.value ?? 0),
              checkoutUrl: o.checkout_url!.split('?')[0],
              ...planoDa(o),
            };
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

function contatoGuru(c: ContatoOferta): Record<string, string> {
  const fone = (c.telefone ?? '').replace(/\D/g, '');
  const contact: Record<string, string> = {};
  if (c.nome) contact.name = c.nome;
  if (c.email) contact.email = c.email;
  if (fone.length >= 10) {
    let local = fone.startsWith('55') && fone.length >= 12 ? fone.slice(2) : fone;
    // Celular no formato antigo (DDD + 8 dígitos, WhatsApp guarda assim): o checkout
    // recusa como "número inválido" sem o 9 na frente.
    if (local.length === 10 && /[6-9]/.test(local[2])) local = `${local.slice(0, 2)}9${local.slice(2)}`;
    contact.phone_local_code = '55';
    contact.phone_number = local;
  }
  return contact;
}

interface GuruDynamicOffer {
  id: string;
  value?: number;
  source?: string | null;
  url?: string;
  contact_email?: string | null;
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

  const contact = contatoGuru(params.contato);

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

/*
 * Assinatura: cupom + contato.
 *
 * A Guru não troca o valor de assinatura pela oferta dinâmica, mas aceita cupom
 * pela URL (`coupon=`). O cupom fica preso ao e-mail do aluno, a um uso, ao
 * produto e a 7 dias, e vale para todas as mensalidades (maximum_subscription_cycles
 * = 0). O checkout só aplica o cupom do link depois que o contato está preenchido, e
 * sem e-mail ele não preenche nada (nem nome): por isso o e-mail é obrigatório aqui e
 * o link leva também uma oferta dinâmica só com o contato. Testado em 06/10/2026 no
 * Tecnólogo mensal: "Cupom aplicado! Válido para todos os ciclos", R$ 197 → R$ 177,30.
 *
 * O checkout precisa estar com "Permitir cupom de desconto" ligado no produto (painel
 * da Guru, não dá pela API). Sem isso o cupom é ignorado em silêncio.
 */

const VALIDADE_CUPOM_DIAS = 7;

interface GuruCupom {
  id: string;
  coupon_code: string;
  date_end?: number;
  is_active?: number;
}

/** Código estável por aluno + oferta + valor, para devolver o mesmo cupom se pedirem de novo. */
function codigoCupom(contactId: string, offerId: string, desconto: number, email: string, tentativa = 0): string {
  const h = createHash('sha256').update(`${contactId}|${offerId}|${desconto}|${email.toLowerCase()}|${tentativa}`).digest('hex');
  return `MC${h.slice(0, 8).toUpperCase()}`;
}

async function cupomPorCodigo(codigo: string): Promise<GuruCupom | null> {
  const lista = await guru<GuruLista<GuruCupom>>(
    `/coupons?coupon_code=${encodeURIComponent(codigo)}&is_active=all&has_transactions=all&validate_by=email`
  );
  return (lista.data ?? []).find((c) => c.coupon_code === codigo) ?? null;
}

async function ofertaSoContato(base: OfertaBase, contactId: string, contato: ContatoOferta): Promise<string | null> {
  const contact = contatoGuru(contato);
  if (!Object.keys(contact).length) return null;
  const source = `monsterchat:${contactId}:${base.offerId}:contato`;
  const lista = await guru<GuruLista<GuruDynamicOffer>>('/dynamic-offers');
  // Só reaproveita se o e-mail bate: sem e-mail o checkout não preenche nada e o cupom não entra.
  const igual = (lista.data ?? []).find(
    (d) => d.source === source && (d.contact_email ?? '').toLowerCase() === (contact.email ?? '').toLowerCase()
  );
  if (igual) return igual.id;
  const criada = await guru<GuruDynamicOffer>('/dynamic-offers', {
    method: 'POST',
    body: JSON.stringify({ offer_id: base.offerId, product_qty: 1, source, blocked: 0, contact }),
  });
  return criada?.id ?? null;
}

export async function gerarLinkComCupom(params: {
  base: OfertaBase;
  valor: number;
  contactId: string;
  contato: ContatoOferta;
}): Promise<{ link: string; cupom: string; reaproveitado: boolean }> {
  const desconto = centavos(params.base.valor - params.valor);
  if (desconto <= 0) throw new Error('Valor com desconto tem de ser menor que o preço cheio.');
  const agora = Math.floor(Date.now() / 1000);

  let codigo = '';
  let reaproveitado = false;
  for (let tentativa = 0; tentativa < 5 && !codigo; tentativa++) {
    const c = codigoCupom(params.contactId, params.base.offerId, desconto, params.contato.email?.trim() ?? '', tentativa);
    const existente = await cupomPorCodigo(c);
    if (!existente) {
      const email = params.contato.email?.trim();
      await guru<GuruCupom>('/coupons', {
        method: 'POST',
        body: JSON.stringify({
          coupon_code: c,
          date_ini: agora - 60,
          date_end: agora + VALIDADE_CUPOM_DIAS * 86400,
          validate_by: 'email',
          emails: email ? [email] : [],
          incidence_field: 'products',
          incidence_type: 'value',
          incidence_value: desconto,
          is_active: true,
          maximum_subscription_cycles: 0,
          product_ids: [params.base.productId],
          usage_contact: 1,
          usage_total: 1,
        }),
      });
      codigo = c;
    } else if (existente.is_active && Number(existente.date_end ?? 0) > agora) {
      codigo = c;
      reaproveitado = true;
    }
    // Vencido ou desativado: tenta o próximo código da sequência.
  }
  if (!codigo) throw new Error('Não consegui criar o cupom na Guru.');

  const settings = await ofertaSoContato(params.base, params.contactId, params.contato).catch(() => null);
  const qs = new URLSearchParams();
  if (settings) qs.set('settings', settings);
  qs.set('coupon', codigo);
  return { link: `${params.base.checkoutUrl}?${qs.toString()}`, cupom: codigo, reaproveitado };
}
