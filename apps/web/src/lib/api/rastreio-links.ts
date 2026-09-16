/**
 * UTM nos links que o chat envia — para a venda chegar na Guru com origem.
 *
 * Um terço das vendas passa por uma conversa no WhatsApp antes da compra, e o
 * atendente cola o link "cru" da página ou do checkout. A Guru gravava essas
 * vendas sem origem nenhuma. Aqui todo link da Monster/Fagenius que sai por
 * atendente ou pela IA ganha:
 *
 *   utm_source=monsterchat
 *   utm_medium=whatsapp | instagram
 *   utm_campaign=<slug da página ou da oferta>
 *   utm_content=<quem enviou: slug do atendente ou "ia">
 *   utm_term=<de onde o lead veio antes do chat: utm_source do contato ou "organico">
 *
 * Link que já traz utm_source fica intacto (ex.: link de anúncio colado pelo
 * atendente). E-mails (atendimento@monsterconcursos.com.br) não são tocados.
 * O site repassa essas UTMs até o checkout (UtmPropagator), então vale tanto
 * para link de página quanto de checkout.
 */

export interface RastreioChat {
  canal: 'whatsapp' | 'instagram';
  /** Quem enviou, já em slug (use `slugAutor`). */
  autor: string;
  /** utm_source da origem do contato (metadata.campaign), se houver. */
  origem?: string | null;
}

const DOMINIO = /(?<![@\w.-])(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:monsterconcursos|fagenius)\.com\.br(?:[/?#][^\s<>"'`]*)?/gi;
const PONTUACAO_FINAL = /[.,;:!?)\]}*_~]+$/;

/** Slugs de oferta/página que não servem como nome de campanha. */
const ALIAS: Record<string, string> = {
  tecnologogestaopublica: 'tecnologo-gestao-publica',
  tecnologogestaopublicaead: 'tecnologo-gestao-publica',
  'gestao-de-seguranca-publica': 'sequencial',
};

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** "Maria Souza" → "maria-souza"; sem nome → fallback. */
export function slugAutor(nome: string | null | undefined, fallback = 'atendente'): string {
  const s = nome ? slug(nome) : '';
  return s || fallback;
}

/** utm_source de origem guardado no contato, ou "organico". */
export function origemDoContato(metadata: unknown): string {
  const campaign = (metadata as { campaign?: { utm_source?: string } } | null)?.campaign;
  return campaign?.utm_source ? slug(campaign.utm_source) || 'organico' : 'organico';
}

function campanha(u: URL): string {
  const partes = u.pathname.split('/').filter(Boolean);
  if (partes.length === 0) return u.hostname.includes('fagenius') ? 'fagenius' : 'institucional';
  // checkout: /pay/<oferta>, /checkout/<oferta>, /subscribe/<oferta>
  const ultimo = partes[partes.length - 1].toLowerCase().replace(/-20\d\d$/, '');
  return ALIAS[ultimo] ?? (slug(ultimo) || 'institucional');
}

function marcarUm(bruto: string, r: RastreioChat): string {
  const fim = bruto.match(PONTUACAO_FINAL)?.[0] ?? '';
  const link = fim ? bruto.slice(0, -fim.length) : bruto;
  const temEsquema = /^https?:\/\//i.test(link);
  let u: URL;
  try {
    u = new URL(temEsquema ? link : `https://${link}`);
  } catch {
    return bruto;
  }
  if (u.searchParams.has('utm_source')) return bruto;
  u.searchParams.set('utm_source', 'monsterchat');
  u.searchParams.set('utm_medium', r.canal);
  u.searchParams.set('utm_campaign', campanha(u));
  u.searchParams.set('utm_content', r.autor);
  u.searchParams.set('utm_term', r.origem || 'organico');
  return u.toString() + fim;
}

/** Devolve o texto com os links da Monster/Fagenius marcados. */
export function marcarLinks(texto: string, r: RastreioChat): string {
  if (!texto) return texto;
  return texto.replace(DOMINIO, (m) => marcarUm(m, r));
}
