/**
 * Mensagens automáticas do site que já dizem o concurso ("…tirar uma dúvida
 * sobre o concurso da GCM de Paulínia.") → o curso exato do catálogo.
 *
 * O getMatchingProducts é solto de propósito (busca por palavra, serve para o
 * agente conferir o catálogo) e erra aqui: "GCM de Paulínia" virava Ipatinga e
 * "PMMG (Soldado)" virava CBMMG. Como esta resposta sai sem passar pelo modelo,
 * a regra é rígida: corporação, lugar e cargo precisam bater, e só vale se
 * sobrar UM curso. Na dúvida devolve null e a conversa segue para o agente.
 */
import type { ProductRow } from './catalog';

/** Modelos de mensagem do site (o que vem depois do prefixo é o concurso). */
const SITE_PATTERNS: RegExp[] = [
  /^ola!? vim pelo site da monster concursos e gostaria de tirar uma duvida sobre o concurso (?:da|do|de) (.+?)\.?$/,
  /^ola!? quero me preparar para o concurso (?:da|do|de) (.+?)\.?$/,
  /^ola!? vim pelo site e quero saber sobre o (.+?)\.?$/,
];

function baseNormalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Concurso citado na mensagem padrão do site, ou null se a mensagem não for uma delas. */
export function extractSiteTarget(message: string): string | null {
  const text = baseNormalize(message);
  for (const re of SITE_PATTERNS) {
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

const UFS =
  'ac al ap am ba ce df es go ma mt ms mg pa pb pr pe pi rj rn rs ro rr sc sp se to';
const UF_SET = new Set(UFS.split(' '));

const STATE_NAMES: Array<[RegExp, string]> = [
  [/\bminas gerais\b/g, 'mg'],
  [/\bespirito santo\b/g, 'es'],
  [/\brio de janeiro\b/g, 'rj'],
  [/\brio grande do norte\b/g, 'rn'],
  [/\brio grande do sul\b/g, 'rs'],
  [/\bsao paulo\b/g, 'sp'],
  [/\bbahia\b/g, 'ba'],
  [/\bpernambuco\b/g, 'pe'],
  [/\bmaranhao\b/g, 'ma'],
  [/\balagoas\b/g, 'al'],
  [/\bpiaui\b/g, 'pi'],
  [/\bgoias\b/g, 'go'],
  [/\bsergipe\b/g, 'se'],
  [/\bparana\b/g, 'pr'],
  [/\bsanta catarina\b/g, 'sc'],
  [/\bceara\b/g, 'ce'],
];

const CORPS: Array<[RegExp, string]> = [
  [/\bguarda (civil )?municipal\b|\bguarda civil\b/g, 'gcm'],
  [/\bpolicia penal\b|\bpolicial penal\b/g, 'pp'],
  [/\bpolicia civil\b/g, 'pc'],
  [/\bpolicia militar\b/g, 'pm'],
  [/\bcorpo de bombeiros( militar)?\b|\bbombeiros? militar\b|\bbombeiros?\b/g, 'cbm'],
];
const CORP_SET = new Set(['gcm', 'pp', 'pc', 'pm', 'cbm']);

const ROLE_WORDS: Record<string, string> = {
  soldado: 'soldado',
  oficial: 'cfo',
  cfo: 'cfo',
  investigador: 'investigador',
  escrivao: 'escrivao',
  agente: 'agente',
  delegado: 'delegado',
  perito: 'perito',
  inspetor: 'inspetor',
  monitor: 'monitor',
};

const NOISE = new Set(
  'o a os as de da do das dos e em para no na aqui cidade estado curso cursos preparatorio concurso analise edital vagas monster policia policial militar civil guarda'.split(
    ' '
  )
);

interface Parsed {
  corp: string | null;
  roles: Set<string>;
  places: Set<string>;
}

/** "PMMG (Soldado)" → { corp: pm, roles: [soldado], places: [mg] } */
function parse(raw: string): Parsed {
  let text = baseNormalize(raw).replace(/[^a-z0-9\s]/g, ' ');
  for (const [re, uf] of STATE_NAMES) text = text.replace(re, uf);
  for (const [re, corp] of CORPS) text = text.replace(re, ` ${corp} `);
  // Siglas coladas: pmmg, cbmba, pcpe, ppma, pmerj…
  text = text
    .replace(/\bpmerj\b/g, 'pm rj')
    .replace(new RegExp(`\\b(gcm|pm|pc|pp|cbm)(${UFS.replace(/ /g, '|')})\\b`, 'g'), '$1 $2');

  const parsed: Parsed = { corp: null, roles: new Set(), places: new Set() };
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (CORP_SET.has(w)) parsed.corp ??= w;
    else if (ROLE_WORDS[w]) parsed.roles.add(ROLE_WORDS[w]);
    else if (/^\d+$/.test(w) || NOISE.has(w)) continue;
    else parsed.places.add(w);
  }
  return parsed;
}

/**
 * Corporação e lugar vêm do nome e do concurso; o cargo cadastrado ("Guarda
 * Civil Metropolitano", "3ª classe (Código 2698)") só entra para o cargo —
 * o resto dele viraria "lugar" e empataria cursos diferentes.
 */
function parseProduct(p: ProductRow): Parsed {
  const parsed = parse([p.name.replace(/\(an[áa]lise de edital\)/i, ''), p.target_exam].filter(Boolean).join(' '));
  if (p.target_role) for (const r of parse(p.target_role).roles) parsed.roles.add(r);
  return parsed;
}

/**
 * O curso do catálogo para o concurso citado, ou null quando não há um único
 * curso que bata (sem curso, ambíguo, cargo diferente).
 */
export function matchSiteCourse(target: string, products: ProductRow[]): ProductRow | null {
  const want = parse(target);
  if (!want.places.size && !want.corp) return null;

  const seen = new Set<string>();
  const candidates: Array<{ p: ProductRow; extras: number }> = [];
  for (const p of products) {
    if (p.brand !== 'monster') continue;
    const key = p.slug || p.id;
    if (seen.has(key)) continue;
    seen.add(key);

    const have = parseProduct(p);
    if (want.corp && have.corp !== want.corp) continue;
    if ([...want.places].some((w) => !have.places.has(w))) continue;
    if (want.roles.size && ![...want.roles].some((r) => have.roles.has(r))) continue;

    // Quanto do curso NÃO foi pedido: "GCM de São Paulo" casa com GCM São Paulo
    // (0 a mais) e com GCM Paulínia - SP (1 a mais); fica o mais justo.
    const extraPlaces = [...have.places].filter((w) => !want.places.has(w) && !UF_SET.has(w)).length;
    const extraRoles = [...have.roles].filter((r) => !want.roles.has(r)).length;
    candidates.push({ p, extras: extraPlaces * 10 + extraRoles });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.extras - b.extras);
  if (candidates.length > 1 && candidates[0].extras === candidates[1].extras) return null;
  return candidates[0].p;
}
