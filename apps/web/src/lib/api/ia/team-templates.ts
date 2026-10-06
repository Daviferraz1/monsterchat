/**
 * Textos padrão que a equipe já envia, copiados das conversas reais.
 *
 * A IA errava justamente aqui: escrevia a própria versão da saudação e da
 * apresentação de curso, e o atendente descartava a sugestão para colar o
 * texto de sempre. Com o modelo fixo, a sugestão sai igual ao que ele enviaria.
 */
import type { ProductRow } from './catalog';
import { courseRoleTitle } from './site-course-match';

/** Roteiro de abertura (enviado 494 vezes, idêntico, em set/2026). */
export const OPENING_SCRIPT = `Olá! 🚀

Temos diversas opções para acelerar sua aprovação! Para eu te indicar o melhor caminho, qual é o seu objetivo atual?

👉 Você busca um Curso Preparatório para algum concurso específico?
👉 Ou tem interesse em nossos Cursos Superiores (Tecnólogo ou Sequencial de 3 meses)?

Me conte um pouco mais sobre o que você procura!`;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mensagens automáticas do site que não dizem qual curso o lead quer. */
const GENERIC_SITE_MESSAGES = new Set(
  [
    'Olá! Vim pelo site da Monster Concursos e gostaria de tirar uma dúvida sobre os cursos da Monster Concursos.',
    'Olá! Quero mais informações sobre os cursos do Monster Concursos',
  ].map(normalize)
);

const GREETING_WORDS = new Set(
  'oi oii oiii ola opa eai e ai bom boa dia tarde noite tudo bem td bom blz beleza tranquilo como vai voce vc pessoal hello hi'.split(
    ' '
  )
);

/** "Bom dia", "Oi, tudo bem?", "Olá!" — só cumprimento, sem pedido nenhum. */
function isGreetingOnly(text: string): boolean {
  const words = normalize(text).split(' ').filter(Boolean);
  return words.length > 0 && words.length <= 6 && words.every((w) => GREETING_WORDS.has(w));
}

export function isGenericOpeningMessage(text: string): boolean {
  return GENERIC_SITE_MESSAGES.has(normalize(text)) || isGreetingOnly(text);
}

/**
 * Mensagens do lead numa conversa que a equipe ainda não respondeu, ou null se
 * já houver resposta. Espera o transcript no formato montado em
 * /api/ia/suggestion ("ALUNO: ..." / "ATENDENTE: ..." por linha).
 */
export function openingMessages(transcript: string | undefined): string[] | null {
  if (!transcript?.trim()) return null;
  const turns = transcript.split(/\n(?=(?:ALUNO|ATENDENTE): )/);
  if (turns.some((t) => t.startsWith('ATENDENTE: '))) return null;
  const bodies = turns.map((t) => t.replace(/^ALUNO: /, '').trim()).filter(Boolean);
  return bodies.length ? bodies : null;
}

/**
 * true quando a conversa está começando e o lead ainda não disse o que procura:
 * ninguém da equipe respondeu e todas as mensagens dele são cumprimento ou a
 * mensagem padrão do site. É a hora do roteiro de abertura.
 */
export function isGenericOpening(transcript: string | undefined): boolean {
  return openingMessages(transcript)?.every(isGenericOpeningMessage) ?? false;
}

/**
 * Nome do curso para o aluno. Alguns itens do catálogo vieram da página de
 * análise ("Concurso GCM Mauá/SP (análise de edital)") e não podem aparecer assim.
 */
export function courseLabel(p: ProductRow): string {
  return p.name
    .replace(/\s*\(an[áa]lise de edital\)\s*/i, '')
    .replace(/^Concurso\s+/i, 'Curso ')
    .trim();
}

/** Combo junta produtos diferentes (ex.: Sequencial + preparatório): a lista padrão de preparatório não o descreve. */
function ehCombo(p: ProductRow): boolean {
  return /\bcombo\b/i.test(p.name) && !!p.includes?.trim();
}

/** Lista padrão da apresentação de curso preparatório (como a equipe envia). */
function checklist(p: ProductRow): string[] {
  if (ehCombo(p)) {
    return p
      .includes!.split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `✅${l}`);
  }
  const items = [
    `Acesso ao ${courseLabel(p)}`,
    'Atualizado com base no edital',
    'Videoaulas',
    'Acelerador de Vídeos',
    'Materiais em PDF',
    'Cronograma individual',
    'Acesso ao Monster Questões (mais de 1 milhão de questões disponíveis)',
    'Curso 100% Online',
  ];
  const extra = [p.includes, p.highlights, p.extra_info_for_ia].filter(Boolean).join(' ');
  if (/monster\s*sound/i.test(extra)) items.push('Acesso ao Monster Sound');
  return items.map((i) => `✅${i}`);
}

/**
 * "R$ 397,00 (de R$ 497,00) (ou até 12x de R$ 44,20 no cartão)"
 *   → "R$ 397,00 à vista ou 12x de R$ 44,20"
 * Sem preço em reais no catálogo ("Consultar na página de vendas"), devolve null.
 */
export function formatPriceLine(priceDisplay: string | null | undefined): string | null {
  const text = priceDisplay?.trim() ?? '';
  const cash = text.match(/^R\$\s?[\d.]+,\d{2}/);
  if (!cash) return null;
  const installments = text.match(/(\d+)x de R\$\s?([\d.]+,\d{2})/);
  const base = `${cash[0]} à vista`;
  return installments ? `${base} ou ${installments[1]}x de R$ ${installments[2]}` : base;
}

/** Página de vendas com a UTM do chat — mesma convenção dos links que a equipe envia. */
export function salesLinkWithUtm(url: string): string {
  const clean = url.trim();
  if (clean.includes('?')) return clean;
  const campaign = clean.replace(/\/+$/, '').split('/').pop() || 'curso';
  const params = new URLSearchParams({
    utm_source: 'monsterchat',
    utm_medium: 'whatsapp',
    utm_campaign: campaign,
    utm_content: 'ia',
    utm_term: 'organico',
  });
  return `${clean}?${params.toString()}`;
}

/**
 * Apresentação de curso no modelo da equipe: link, nome, ✅ lista, valores.
 * Só para preparatórios Monster; Fagenius tem tom formal e outro formato.
 */
export function formatSalesPitch(p: ProductRow): string | null {
  if (p.brand !== 'monster') return null;
  const link = p.sales_page_url?.trim() || p.checkout_url?.trim();
  if (!link) return null;
  const parts = [salesLinkWithUtm(link), '', courseLabel(p), '', ...checklist(p)];
  const price = formatPriceLine(p.price_display);
  if (price) parts.push('', 'Valores:', price);
  // Combo também é vendido em mensalidades (ex.: 6x de R$ 297); a linha à vista sozinha escondia a opção.
  if (price && ehCombo(p) && p.price_recurring_display?.trim()) parts.push(`ou ${p.price_recurring_display.trim()}`);
  return parts.join('\n');
}

/**
 * Resposta ao lead que veio do site já dizendo o concurso: saudação, aviso de
 * que o curso existe e a apresentação completa (como a equipe faz à mão).
 * Com mais de um cargo (Soldado e CFO), apresenta cada curso em sequência.
 */
export function formatSiteLeadReply(products: ProductRow[], saudacao: string | null): string | null {
  const many = products.length > 1;
  const pitches = products
    .map((p) => {
      const pitch = formatSalesPitch(p);
      if (!pitch) return null;
      // Com mais de um curso, o cargo vai no topo: "Curso PM Bahia - 2.500 Vagas"
      // não diz que é o de Soldado.
      const role = many ? courseRoleTitle(p) : null;
      return role ? `👉 *${role}*
${pitch}` : pitch;
    })
    .filter((p): p is string => !!p);
  if (!pitches.length) return null;
  const oi = saudacao ? `${saudacao.charAt(0).toUpperCase()}${saudacao.slice(1)}! 😊` : 'Olá! 😊';
  const intro =
    pitches.length === 1
      ? `Temos o curso preparatório para *${shortName(products[0])}* disponível. Confira todos os detalhes aqui:`
      : `Temos ${pitches.length} cursos preparatórios disponíveis para esse concurso. Confira os detalhes de cada um:`;
  return [oi, intro, ...pitches].join('\n\n');
}

function shortName(p: ProductRow): string {
  return courseLabel(p).replace(/^Curso\s+(Preparat[óo]rio\s+)?/i, '');
}
