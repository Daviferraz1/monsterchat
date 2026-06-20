import { getMatchingProducts } from './catalog';
import type { ProductRow } from './catalog';
import { apiEnv } from '../env';
import { getCredentialsByEmail } from '../contacts-credentials';
import { searchKnowledge } from './knowledge-search';
import type { KbRow } from './knowledge-search';
import { generateAgenticSuggestion } from './agent';

/** Confiança para a busca por palavra-chave (ts_rank, valores pequenos). */
function similarityToConfidence(similarity: number): 'high' | 'medium' | 'low' | 'none' {
  if (similarity >= 0.5) return 'high';
  if (similarity >= 0.2) return 'medium';
  if (similarity > 0) return 'low';
  return 'none';
}

/** Confiança para a busca semântica (similaridade de cosseno, ~0–1). */
function cosineToConfidence(similarity: number): 'high' | 'medium' | 'low' | 'none' {
  if (similarity >= 0.78) return 'high';
  if (similarity >= 0.68) return 'medium';
  if (similarity >= 0.55) return 'low';
  return 'none';
}

function shouldUseCatalogSuggestion(messageBody: string): boolean {
  const t = messageBody.toLowerCase();
  // Catálogo deve entrar forte quando o lead está em intenção comercial.
  return /(preco|preço|valor|quanto|custa|investimento|parcel|boleto|pix|carta[oã]|checkout|link|comprar|assinatura)/.test(t);
}

export interface SuggestionResult {
  confidence: 'high' | 'medium' | 'low' | 'none';
  suggestion: string | null;
  category: string | null;
  alternatives: Array<{ question_pattern: string; gold_response: string; frequency: number; similarity: number }>;
}

/** Contexto do contato para as ferramentas do agente (pagamento/acesso/imagens). */
export interface SuggestionAgentContext {
  contactId?: string;
  contactPhone?: string;
  conversationId?: string;
  /** Imagens recentes enviadas pelo aluno (print de questão, comprovante, tela). */
  images?: Array<{ url: string; mime?: string | null }>;
  /** Conversa completa (aluno + atendente) para a IA saber o que já foi respondido. */
  transcript?: string;
  /** Saudação conforme o horário atual (ex.: "boa tarde"). */
  nowHint?: string;
  /** Memória da conversa (resumo + ficha) para conversas longas. */
  memoryBlock?: string;
}

const EMPTY_RESULT: SuggestionResult = {
  confidence: 'none',
  suggestion: null,
  category: null,
  alternatives: [],
};

/** Primeiro nome para uso em saudação (evita "Maria Silva" -> "Olá, Maria!"). */
function getFirstName(fullName: string): string {
  const name = fullName.trim();
  const first = name.split(/\s+/)[0];
  return first || name;
}

/** Saudação inicial quando temos o nome do lead (tom humano, comercial). */
function greeting(contactName: string | undefined): string {
  if (!contactName?.trim()) return '';
  const first = getFirstName(contactName);
  return `Oi, ${first}! `;
}

/** Substitui placeholders de nome do aluno pelo primeiro nome do contato (base de conhecimento pode ter {nome_aluno}). */
function replaceNamePlaceholders(text: string | null, contactName?: string): string | null {
  if (!text?.trim()) return text;
  const firstName = contactName?.trim() ? getFirstName(contactName) : '';
  const name = firstName || '';
  let out = text
    .replace(/\{nome_aluno\}/gi, name)
    .replace(/\{nome\}/gi, name)
    .replace(/\[nome_aluno\]/gi, name)
    .replace(/\[nome\]/gi, name);
  if (!name) {
    out = out.replace(/\s*,\s*!\s*/g, '! ').replace(/\s{2,}/g, ' ');
  }
  return out.trim();
}

/** Texto padrão sobre formas de pagamento (boleto, Pix, cartão; recorrência mensal). Parcelado só no cartão. */
const PAYMENT_METHODS_INFO =
  'Pix, boleto ou cartão.\n(No cartão você pode parcelar; Pix e boleto são à vista.)';

/** Apenas o concurso (target_exam) para a frase de objetivo; fallback no nome do produto. */
function concursoLabel(p: ProductRow): string {
  if (p.target_exam?.trim()) return p.target_exam.trim();
  return p.name;
}

/** Concordância em português: "no" (masculino) ou "na" (feminino) + concurso. Ex.: "no Bombeiro Militar de Minas", "na Guarda Municipal". */
function preposicaoConcurso(concurso: string): string {
  const firstWord = concurso.toLowerCase().trim().split(/\s+/)[0] ?? '';
  const feminino = ['guarda', 'polícia', 'policia', 'prefeitura', 'defensoria'];
  const usaNa = feminino.some((w) => firstWord === w || firstWord.startsWith(w));
  return usaNa ? `na ${concurso}` : `no ${concurso}`;
}

/** Bloco "o que você recebe": usa includes/highlights do produto ou lista padrão. */
function formatWhatYouGet(p: ProductRow): string {
  if (p.includes?.trim() || p.highlights?.trim()) {
    const parts: string[] = [];
    if (p.includes?.trim()) parts.push(p.includes.trim());
    if (p.highlights?.trim()) parts.push(p.highlights.trim());
    return parts
      .join('\n')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `✅ ${line}`)
      .join('\n');
  }
  return `✅ Videoaulas completas
Centenas de horas cobrindo 100% do conteúdo do edital.

✅ Material em PDF
Apostilas, resumos e mapas mentais para baixar e estudar offline.

✅ Monster Questões
Mais de 100 mil questões comentadas para treinar até chegar no nível da prova.

✅ Monster Study
Cronograma inteligente que organiza seus estudos e te mostra exatamente o que estudar todos os dias.

✅ Monster Sound
Aulas em áudio para estudar no carro, caminhando ou treinando.

✅ Professores especialistas
Equipe experiente em concursos e aprovações.`;
}

/** Monta sugestão de curso no modelo comercial (nome, objetivo, investimento, o que recebe, link, acesso imediato). */
function formatProductSuggestion(products: ProductRow[], contactName?: string): string {
  const firstName = contactName?.trim() ? getFirstName(contactName) : null;
  const lead = firstName ? `Oi, ${firstName}! Tudo bem?\n\n` : '';

  const blocks: string[] = [];
  products.forEach((p, index) => {
    const concurso = concursoLabel(p);
    const noNaConcurso = preposicaoConcurso(concurso);
    const parts: string[] = [];

    if (index === 0) parts.push(lead);
    parts.push(
      `Se o seu objetivo é conquistar a vaga ${noNaConcurso}, esse curso é a preparação certa para chegar competitivo na prova. Todo o conteúdo é direcionado para o edital e focado no que realmente cai.`
    );
    parts.push('');
    parts.push('💰 Investimento:');
    parts.push(`• ${p.price_display} à vista`);
    if (p.price_recurring_display?.trim()) {
      parts.push(`ou ${p.price_recurring_display} no cartão.`);
    } else {
      parts.push('(valores no link abaixo)');
    }
    parts.push('');
    parts.push('💳 Formas de pagamento:');
    parts.push(PAYMENT_METHODS_INFO);
    parts.push('');
    parts.push('📚 O que você recebe no curso:');
    parts.push('');
    parts.push(formatWhatYouGet(p));
    if (p.duration?.trim()) {
      parts.push('');
      parts.push(`⏳ Acesso por ${p.duration}, para estudar com tranquilidade até a prova.`);
    } else {
      parts.push('');
      parts.push('⏳ Acesso para estudar com tranquilidade até a prova.');
    }
    parts.push('');
    parts.push(`🚨 Se seu objetivo é passar ${noNaConcurso}, o ideal é começar a preparação agora, antes que a concorrência avance nos estudos.`);
    parts.push('');
    const salesPage = p.sales_page_url?.trim();
    if (salesPage) {
      // Lead avaliando o curso → página de vendas (o checkout fica para quando ele decidir comprar).
      parts.push('👉 Veja todos os detalhes e garanta sua vaga aqui:');
      parts.push(salesPage);
    } else {
      parts.push('👉 Garanta sua vaga aqui:');
      parts.push(p.checkout_url);
      if (p.checkout_url_subscription?.trim()) {
        parts.push(`(Plano mensal: ${p.checkout_url_subscription.trim()})`);
      }
    }
    parts.push('');
    parts.push('Assim que confirmar o pagamento, seu acesso é liberado imediatamente e você já inicia a preparação.');

    blocks.push(parts.join('\n'));
  });
  return blocks.join('\n\n');
}

/** Aplica saudação ao texto da base de conhecimento quando temos nome. */
function wrapWithGreeting(text: string | null, contactName: string | undefined): string | null {
  if (!text?.trim()) return text;
  const lead = greeting(contactName);
  if (!lead) return text;
  return lead + text.trim();
}

/** Detecta se o lead está dizendo que não recebeu o acesso (curso/preparatório). */
function isAskingAboutMissingAccess(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, ' ');
  return (
    /\bnão\s+receb(eu|i)\s+(o\s+)?acesso\b/.test(t) ||
    /\bnão\s+recebeu\s+(o\s+)?acesso\b/.test(t) ||
    /\bnão\s+recebi\s+(o\s+)?acesso\s+do\s+curso\b/.test(t) ||
    /\bnão\s+chegou\s+(o\s+)?acesso\b/.test(t) ||
    /\bnão\s+receb(eu|i)\s+o\s+acesso\s+de\s+curso\b/.test(t) ||
    /\bacesso\s+de\s+curso\s+preparat[oó]rio\b.*\bnão\s+receb/.test(t)
  );
}

const SUGGESTION_ASK_EMAIL_ACCESS =
  'Por favor, informe o e-mail que você usou na compra para localizarmos seu acesso.';

/** Extrai o primeiro e-mail encontrado no texto. */
function extractEmail(text: string): string | null {
  const match = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  return match ? match[0].trim().toLowerCase() : null;
}

/** Monta mensagem com os acessos (login/senha) por plataforma para o atendente enviar. */
function formatAccessSuggestion(
  credentials: Array<{ platformLabel: string; login: string; password: string }>
): string {
  const lines: string[] = ['Segue seu acesso:', ''];
  for (const c of credentials) {
    lines.push(`${c.platformLabel}:`);
    lines.push(`Login: ${c.login}`);
    lines.push(`Senha: ${c.password}`);
    lines.push('');
  }
  lines.push('Qualquer dúvida, estamos à disposição!');
  return lines.join('\n').trim();
}

function mapAlternatives(rows: SuggestionResult['alternatives'], contactName?: string) {
  return rows.map((a) => ({
    ...a,
    gold_response: replaceNamePlaceholders(a.gold_response, contactName) ?? a.gold_response,
  }));
}

function buildKbResult(
  rows: KbRow[],
  confidenceOf: (similarity: number) => 'high' | 'medium' | 'low' | 'none'
): SuggestionResult {
  if (!rows.length) return EMPTY_RESULT;
  const top = rows[0];
  return {
    confidence: confidenceOf(top.similarity),
    suggestion: top.gold_response,
    category: top.category,
    alternatives: rows.slice(1).map((r) => ({
      question_pattern: r.question_pattern,
      gold_response: r.gold_response,
      frequency: r.frequency,
      similarity: r.similarity,
    })),
  };
}

/** Base de conhecimento (semântica + fallback full-text), no formato de sugestão. */
async function searchKnowledgeBase(messageBody: string, brand?: string): Promise<SuggestionResult> {
  const { rows, semantic } = await searchKnowledge(messageBody, brand);
  return buildKbResult(rows, semantic ? cosineToConfidence : similarityToConfidence);
}

/**
 * Gera a sugestão de resposta para o atendente.
 * - Atalhos determinísticos (não recebeu acesso / e-mail → credenciais) rodam sempre.
 * - useAi (copiloto): agente Claude com ferramentas (catálogo, base, pagamento, acesso).
 * - Sem IA (ou se o agente falhar): catálogo + base de conhecimento.
 */
export async function getSuggestion(
  messageBody: string,
  brand?: string,
  contactName?: string,
  useAi: boolean = false,
  agentCtx?: SuggestionAgentContext
): Promise<SuggestionResult> {
  const hasImages = (agentCtx?.images?.length ?? 0) > 0;
  if (!messageBody?.trim() && !hasImages) return EMPTY_RESULT;

  const text = (messageBody ?? '').trim();

  try {
    // 1) Aluno disse que não recebeu o acesso → sugerir pedir o e-mail da compra
    if (isAskingAboutMissingAccess(text)) {
      return {
        confidence: 'high',
        suggestion: replaceNamePlaceholders(SUGGESTION_ASK_EMAIL_ACCESS, contactName),
        category: 'acesso',
        alternatives: [],
      };
    }

    // 2) Mensagem contém um e-mail → buscar credenciais e sugerir os acessos
    const email = extractEmail(text);
    if (email) {
      const credentials = await getCredentialsByEmail(email);
      if (credentials.length > 0) {
        const suggestion = formatAccessSuggestion(
          credentials.map((c) => ({ platformLabel: c.platformLabel, login: c.login, password: c.password }))
        );
        return {
          confidence: 'high',
          suggestion: replaceNamePlaceholders(suggestion, contactName),
          category: 'acesso',
          alternatives: [],
        };
      }
    }

    // 3) Modo IA (copiloto): agente com ferramentas
    if (useAi && apiEnv.ANTHROPIC_API_KEY) {
      const aiSuggestion = await generateAgenticSuggestion({
        conversationText: agentCtx?.transcript || messageBody,
        contactName,
        brand,
        contactId: agentCtx?.contactId,
        contactPhone: agentCtx?.contactPhone,
        conversationId: agentCtx?.conversationId,
        images: agentCtx?.images,
        nowHint: agentCtx?.nowHint,
        memoryBlock: agentCtx?.memoryBlock,
      });
      if (aiSuggestion) {
        return {
          confidence: 'high',
          suggestion: replaceNamePlaceholders(aiSuggestion, contactName),
          category: 'ia',
          alternatives: [],
        };
      }
      // se o agente falhar, cai no caminho determinístico abaixo
    }

    // 4) Determinístico: catálogo (intenção comercial) ou base de conhecimento
    const [kbResult, matchingProducts] = await Promise.all([
      searchKnowledgeBase(messageBody, brand),
      getMatchingProducts(messageBody, brand),
    ]);

    if (shouldUseCatalogSuggestion(messageBody) && matchingProducts.length > 0) {
      const suggestion = formatProductSuggestion(matchingProducts, contactName);
      return {
        confidence: 'high',
        suggestion: replaceNamePlaceholders(suggestion, contactName),
        category: 'produto',
        alternatives: mapAlternatives(kbResult.alternatives, contactName),
      };
    }

    const kbSuggestionFinal = wrapWithGreeting(kbResult.suggestion, contactName);
    return {
      confidence: kbResult.confidence,
      suggestion: replaceNamePlaceholders(kbSuggestionFinal, contactName),
      category: kbResult.category,
      alternatives: mapAlternatives(kbResult.alternatives, contactName),
    };
  } catch (err) {
    console.error('[IA getSuggestion]', err);
    return EMPTY_RESULT;
  }
}
