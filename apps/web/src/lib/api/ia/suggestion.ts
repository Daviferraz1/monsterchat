import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../supabase';
import { getMatchingProducts } from './catalog';
import type { ProductRow } from './catalog';
import { apiEnv } from '../env';

function similarityToConfidence(similarity: number): 'high' | 'medium' | 'low' | 'none' {
  if (similarity >= 0.5) return 'high';
  if (similarity >= 0.2) return 'medium';
  if (similarity > 0) return 'low';
  return 'none';
}

export interface SuggestionResult {
  confidence: 'high' | 'medium' | 'low' | 'none';
  suggestion: string | null;
  category: string | null;
  alternatives: Array<{ question_pattern: string; gold_response: string; frequency: number; similarity: number }>;
}

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

/** Texto padrão sobre formas de pagamento (boleto, Pix, cartão; recorrência mensal). Parcelado só no cartão. */
const PAYMENT_METHODS_INFO =
  'Formas de pagamento: boleto, Pix ou cartão. O cartão pode ser à vista ou parcelado; boleto e Pix são à vista. Em planos com recorrência mensal, aceitamos boleto, Pix ou cartão todo mês.';

/** Monta uma sugestão completa com dados do curso, tom humano e foco em conversão/suporte. */
function formatProductSuggestion(products: ProductRow[], contactName?: string): string {
  const lead = greeting(contactName);
  const intro =
    products.length > 1
      ? `${lead}Pelo que você comentou, acho que esses cursos combinam com o que você busca:`
      : `${lead}Pelo que você comentou, acho que esse curso combina com o que você busca:`;
  const blocks: string[] = [intro, ''];
  for (const p of products) {
    const parts: string[] = [];
    parts.push(`${p.name}`);
    parts.push(`• Valor à vista: ${p.price_display}`);
    if (p.price_recurring_display?.trim())
      parts.push(`• Ou no plano: ${p.price_recurring_display}`);
    parts.push(`• ${PAYMENT_METHODS_INFO}`);
    if (p.includes?.trim()) parts.push(`• Inclui: ${p.includes}`);
    if (p.duration?.trim()) parts.push(`• Duração: ${p.duration}`);
    if (p.highlights?.trim()) parts.push(`• ${p.highlights}`);
    parts.push('');
    parts.push(`Aqui está o link para garantir sua vaga: ${p.checkout_url}`);
    if (p.checkout_url_subscription?.trim())
      parts.push(`Se preferir o plano mensal: ${p.checkout_url_subscription.trim()}`);
    blocks.push(parts.join('\n'));
  }
  return blocks.join('\n\n');
}

/** Aplica saudação ao texto da base de conhecimento quando temos nome. */
function wrapWithGreeting(text: string | null, contactName: string | undefined): string | null {
  if (!text?.trim()) return text;
  const lead = greeting(contactName);
  if (!lead) return text;
  return lead + text.trim();
}

/**
 * Gera sugestão usando Claude (análise contextual, tom humano/comercial).
 */
async function getSuggestionWithClaude(
  context: {
    conversationText: string;
    productBlock: string | null;
    kbSuggestion: string | null;
    contactFirstName: string | null;
  }
): Promise<string | null> {
  if (!apiEnv.ANTHROPIC_API_KEY) return null;
  const systemPrompt = `Você ajuda o atendente a responder leads e alunos. Gere UMA sugestão de mensagem curta (1 a 3 parágrafos) que o atendente pode enviar no WhatsApp.

Regras:
- Tom humano, comercial e de suporte. Objetivo: converter lead ou dar suporte a quem já comprou.
- Em português brasileiro. Use o primeiro nome do lead na abertura se for informado.
- Inclua informações concretas quando houver produto (preço, link, o que inclui). Não invente dados.
- Sobre pagamento: quando falar de boleto, Pix ou cartão, deixe claro que o cartão pode ser à vista ou parcelado; boleto e Pix são à vista (não temos boleto parcelado). Em recorrência mensal, aceitamos boleto, Pix ou cartão todo mês.
- Não use marcadores como [ESCALAR]. Apenas o texto da mensagem.
- Seja direto e útil. Evite respostas genéricas.`;

  const parts: string[] = ['Mensagens recentes do lead (contexto):', context.conversationText];
  parts.push('', 'Informação de formas de pagamento (use quando falar de pagamento):', PAYMENT_METHODS_INFO);
  if (context.productBlock) {
    parts.push('', 'Dados do(s) produto(s) identificado(s) (use na resposta):', context.productBlock);
  }
  if (context.kbSuggestion) {
    parts.push('', 'Sugestão da base de conhecimento (pode inspirar ou incorporar):', context.kbSuggestion);
  }
  if (context.contactFirstName) {
    parts.push('', `Nome do lead para personalizar: ${context.contactFirstName}`);
  }
  parts.push('', 'Gere apenas o texto da sugestão, sem prefixos ou explicações.');

  try {
    const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: parts.join('\n') }],
    });
    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';
    return text?.trim() || null;
  } catch (err) {
    console.error('[IA getSuggestion] Claude:', err);
    return null;
  }
}

/**
 * Busca sugestão na base de conhecimento e no catálogo de produtos.
 * Tanto com IA quanto sem IA: a base de conhecimento é sempre consultada (search_knowledge_base).
 * - Sem IA: retorna a resposta da KB (gold_response) quando há match, ou do catálogo.
 * - Com IA: envia a sugestão da KB (kbSuggestion) no prompt do Claude para inspirar a resposta.
 */
export async function getSuggestion(
  messageBody: string,
  brand?: string,
  contactName?: string,
  useAi: boolean = false
): Promise<SuggestionResult> {
  if (!messageBody?.trim()) {
    return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
  }

  try {
    const [kbResult, matchingProducts] = await Promise.all([
      searchKnowledgeBase(messageBody, brand),
      getMatchingProducts(messageBody, brand),
    ]);

    const productBlock =
      matchingProducts.length > 0
        ? formatProductSuggestion(matchingProducts, contactName)
        : null;
    const kbSuggestion = kbResult.suggestion ?? null;
    const contactFirstName = contactName?.trim()
      ? getFirstName(contactName)
      : null;

    if (useAi && apiEnv.ANTHROPIC_API_KEY) {
      const aiSuggestion = await getSuggestionWithClaude({
        conversationText: messageBody,
        productBlock,
        kbSuggestion,
        contactFirstName,
      });
      if (aiSuggestion) {
        return {
          confidence: 'high',
          suggestion: aiSuggestion,
          category: matchingProducts.length > 0 ? 'produto' : kbResult.category,
          alternatives: kbResult.alternatives,
        };
      }
    }

    if (matchingProducts.length > 0) {
      const suggestion = formatProductSuggestion(matchingProducts, contactName);
      return {
        confidence: 'high',
        suggestion,
        category: 'produto',
        alternatives: kbResult.alternatives,
      };
    }

    return {
      confidence: kbResult.confidence,
      suggestion: wrapWithGreeting(kbResult.suggestion, contactName),
      category: kbResult.category,
      alternatives: kbResult.alternatives,
    };
  } catch (err) {
    console.error('[IA getSuggestion]', err);
    return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
  }
}

async function searchKnowledgeBase(
  messageBody: string,
  brand?: string
): Promise<SuggestionResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('search_knowledge_base', {
      search_text: messageBody,
      search_brand: brand ?? null,
      max_results: 3,
    });

    if (error || !data?.length) {
      return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
    }

    const results = data as Array<{
      id: string;
      brand: string;
      category: string;
      question_pattern: string;
      gold_response: string;
      frequency: number;
      similarity: number;
    }>;

    const top = results[0];
    const confidence = similarityToConfidence(top.similarity);

    return {
      confidence,
      suggestion: top.gold_response,
      category: top.category,
      alternatives: results.slice(1).map((r) => ({
        question_pattern: r.question_pattern,
        gold_response: r.gold_response,
        frequency: r.frequency,
        similarity: r.similarity,
      })),
    };
  } catch {
    return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
  }
}
