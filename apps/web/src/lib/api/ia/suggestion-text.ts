/**
 * Limpeza da saída do agente: separa a mensagem para o aluno do raciocínio.
 *
 * O modelo costumava escrever um parágrafo pensando alto ("O aluno mencionou
 * 'guarda' sem especificar... Vou responder sobre a PMBA") e só depois a
 * mensagem. Em set/2026 isso apareceu em ~8% das sugestões. Agora o prompt pede
 * a mensagem entre <mensagem></mensagem>; o resto é descartado. Sem as tags,
 * cortamos os parágrafos iniciais com cara de raciocínio.
 */

/** Marcador que o modelo devolve quando não há pergunta em aberto para responder. */
export const NO_SUGGESTION_MARKER = /\[SEM[_\s-]?SUGEST[AÃ]O\]/i;

const OPEN_TAG = /<mensagem>/i;
const CLOSE_TAG = /<\/mensagem>/i;

/**
 * Frases em que o modelo fala COM O ATENDENTE (ou consigo mesmo) em vez de
 * escrever para o aluno. Se sobrarem na mensagem final, ela é descartada —
 * por isso os padrões são estreitos: frases que nunca apareceriam numa
 * mensagem escrita para o aluno.
 */
export const META_PATTERNS: RegExp[] = [
  /n[ãa]o h[áa][^.]{0,40}(pergunta|d[úu]vida|quest[ãa]o)[^.]{0,20}(em aberto|pendente)/i,
  /o aluno j[áa] (recebeu|foi atendido|agradeceu)/i,
  /o atendente (pode|poderia|deve|j[áa]|tinha|se comprometeu)/i,
  /\bagora posso responder\b/i,
  /\b(vou|devo) (responder|informar|orientar) (o|a) (aluno|aluna|lead)\b/i,
  /^\s*(sugest[ãa]o de resposta|an[áa]lise|racioc[íi]nio)\s*:/i,
];

/**
 * Parágrafo de raciocínio no INÍCIO da saída (o modelo narrando o que viu nas
 * ferramentas antes de escrever a mensagem). Só serve para cortar esse
 * preâmbulo — nunca descarta a sugestão inteira, e o último parágrafo fica.
 */
const REASONING_PATTERNS: RegExp[] = [
  /^(analisando|verificando|consultando|conferindo|o cat[áa]logo|a base de conhecimento|o contexto [ée]|temos as (duas )?informa[çc][õo]es|recebi os dados|preciso (verificar|perguntar|confirmar))/i,
  /\b(o|a) (aluno|aluna|lead) (j[áa] )?(mencionou|informou|perguntou|enviou|recebeu|tinha|n[ãa]o informou|n[ãa]o especificou)/i,
  /\bvou (responder sobre|corrigir isso|solicitar isso)\b/i,
  /\bveja a resposta\s*:\s*$/i,
];

function isReasoningParagraph(paragraph: string): boolean {
  const p = paragraph.trim();
  return META_PATTERNS.some((re) => re.test(p)) || REASONING_PATTERNS.some((re) => re.test(p));
}

/** Tira parágrafos de raciocínio do início, mantendo ao menos o último parágrafo. */
function stripLeadingReasoning(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  let start = 0;
  while (start < paragraphs.length - 1 && isReasoningParagraph(paragraphs[start])) start++;
  return paragraphs.slice(start).join('\n\n').trim();
}

export interface CleanedSuggestion {
  text: string | null;
  /** Por que a sugestão foi descartada (null = aproveitada). */
  discardedReason: string | null;
}

export function cleanSuggestion(raw: string | null): CleanedSuggestion {
  let text = raw?.trim() ?? '';
  if (!text) return { text: null, discardedReason: null };

  const tagged = [...text.matchAll(/<mensagem>([\s\S]*?)<\/mensagem>/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  if (tagged.length) {
    text = tagged[tagged.length - 1];
  } else if (OPEN_TAG.test(text)) {
    // Abriu a tag e não fechou (estourou max_tokens): fica o que veio depois dela.
    text = text.slice(text.search(OPEN_TAG) + '<mensagem>'.length);
  } else {
    text = stripLeadingReasoning(text);
  }
  text = text.replace(OPEN_TAG, '').replace(CLOSE_TAG, '').trim();

  if (!text || NO_SUGGESTION_MARKER.test(text)) {
    return { text: null, discardedReason: 'sem pergunta em aberto ([SEM_SUGESTAO])' };
  }
  const meta = META_PATTERNS.find((re) => re.test(text));
  if (meta) return { text: null, discardedReason: `meta-texto (${String(meta)})` };
  return { text, discardedReason: null };
}
