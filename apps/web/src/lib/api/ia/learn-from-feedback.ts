/**
 * Aprender com a correção do atendente.
 *
 * Quando o atendente escreve algo diferente da sugestão, a diferença carrega a
 * resposta certa. Este arquivo transforma isso em conhecimento.
 *
 * O QUE MUDOU E POR QUÊ (ver migração 046):
 *
 * Antes, com `learn_kb_use_ai = false`, a correção era gravada CRUA — o contexto
 * inteiro da conversa como pergunta-tipo, a resposta do atendente como
 * resposta-ouro, tudo em category='outro'. Rodou por meses e produziu 17 mil
 * entradas onde a maioria apareceu uma única vez: um arquivo de conversas, não
 * uma base de conhecimento. A busca semântica em cima disso devolve "uma conversa
 * parecida" com o contexto de outro aluno junto, e o modelo serve o fragmento
 * como fato. Foi assim que "você pode estender para 2 anos" virou "o Tecnólogo
 * dura 2 anos" na frente do aluno.
 *
 * Agora: a correção é sempre normalizada e, por padrão, vira PROPOSTA numa fila
 * de curadoria. Entrar direto na base é o que estragou a base.
 */
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../supabase';
import { apiEnv } from '../env';
import { getLearnKbMode } from './autopilot';
import { embedText, isEmbeddingsEnabled } from './embeddings';
import { searchKnowledge } from './knowledge-search';

/** Gera e grava o embedding da pergunta-tipo para que a entrada seja localizável na busca semântica. */
export async function storeEmbedding(id: string | undefined, text: string): Promise<void> {
  if (!id || !isEmbeddingsEnabled()) return;
  try {
    const emb = await embedText(text, 'RETRIEVAL_DOCUMENT');
    if (emb) {
      await supabaseAdmin.from('knowledge_base').update({ embedding: emb }).eq('id', id);
    }
  } catch (err) {
    console.warn('[IA learnFromFeedback] embedding', err);
  }
}

/** Acima desta similaridade de cosseno a pergunta já está na base: é caso de reforçar, não de criar. */
const DUPLICATE_SIMILARITY = 0.9;

export interface DuplicateHit {
  id: string;
  similarity: number;
  frequency: number;
}

/**
 * Procura entrada praticamente igual já existente.
 *
 * Só confia no resultado quando a busca foi semântica: sem embeddings a busca cai
 * no ts_rank, cuja escala não é comparável com similaridade de cosseno — comparar
 * as duas com o mesmo limiar daria falso positivo.
 */
export async function findDuplicate(
  questionPattern: string,
  brand: string
): Promise<DuplicateHit | null> {
  try {
    const { rows, semantic } = await searchKnowledge(questionPattern, brand);
    if (!semantic) return null;
    const top = rows[0];
    if (!top || top.similarity < DUPLICATE_SIMILARITY) return null;
    return { id: top.id, similarity: top.similarity, frequency: top.frequency ?? 1 };
  } catch (err) {
    console.warn('[IA learnFromFeedback] duplicata', err);
    return null;
  }
}

/** Atualiza a entrada existente com a resposta mais recente e soma +1 na frequência. */
export async function reinforceEntry(
  id: string,
  goldResponse: string,
  frequency: number
): Promise<string | null> {
  const { error } = await supabaseAdmin
    .from('knowledge_base')
    .update({
      gold_response: goldResponse.slice(0, 8000),
      frequency: frequency + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) {
    console.warn('[IA learnFromFeedback] reforçar', error.message);
    return null;
  }
  return id;
}

export const CATEGORIES = [
  'financeiro',
  'acesso',
  'matricula',
  'academico',
  'lead',
  'tecnico',
  'duvida',
  'reclamacao',
  'documento',
  'outro',
] as const;
const BRANDS = ['monster', 'fagenius', 'both'] as const;

export interface LearnFromFeedbackParams {
  /** Pergunta/dúvida do aluno (contexto da conversa). */
  questionContext: string;
  /** Resposta que o atendente realmente enviou. */
  actualResponse: string;
  /** O que a IA havia sugerido — o revisor precisa ver os dois lados. */
  suggestedResponse?: string;
  conversationId?: string;
  brand?: 'monster' | 'fagenius' | 'both';
}

interface NormalizedEntry {
  question_pattern: string;
  gold_response: string;
  category: string;
}

const MIN_RESPONSE_LENGTH = 15;

const NORMALIZER_SYSTEM = `Você prepara entradas para a base de conhecimento de um atendimento de cursos.

A partir da dúvida do aluno e da resposta que o atendente enviou, produza UMA entrada normalizada em JSON com exatamente estes campos:
- question_pattern: a pergunta em uma frase curta e GENÉRICA, do jeito que outro aluno faria (ex.: "Qual o valor do curso?", "Como acesso o material?"). Sem saudação, sem nome, sem o contexto específico deste aluno.
- gold_response: a resposta reutilizável, baseada no que o atendente escreveu. Corrija erros de digitação e deixe clara. Mantenha tom humano, português brasileiro.
- category: uma destas exatamente: ${CATEGORIES.join(', ')}.

REGRAS IMPORTANTES:
- Remova QUALQUER dado pessoal: nome, CPF, e-mail, telefone, número de pedido, senha.
- Se a resposta do atendente só faz sentido para aquele aluno específico (ex.: "seu pagamento de 12/03 caiu", "seu acesso já foi liberado"), devolva {"skip": true} — isso não é conhecimento reutilizável, é atendimento pontual.
- Se a resposta contém condição ou alternativa, PRESERVE a condição na resposta ("o curso pode ser feito em 12 meses no formato acelerado ou estendido"). Frase condicional que vira afirmação absoluta é a principal fonte de erro da IA.

Responda APENAS com JSON válido, sem markdown.`;

/** Destila a correção do atendente numa entrada reutilizável. Null quando não há o que aprender. */
async function normalize(
  questionContext: string,
  actualResponse: string
): Promise<NormalizedEntry | null> {
  if (!apiEnv.ANTHROPIC_API_KEY) return null;
  const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: NORMALIZER_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Dúvida do aluno:\n${questionContext.slice(0, 2000)}\n\nResposta enviada pelo atendente:\n${actualResponse.slice(0, 3000)}`,
      },
    ],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let entry: NormalizedEntry & { skip?: boolean };
  try {
    entry = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
  if (entry.skip) return null;
  if (!entry.question_pattern?.trim() || !entry.gold_response?.trim()) return null;

  return {
    question_pattern: entry.question_pattern.trim().slice(0, 1000),
    gold_response: entry.gold_response.trim().slice(0, 8000),
    category: CATEGORIES.includes(entry.category as (typeof CATEGORIES)[number])
      ? entry.category
      : 'outro',
  };
}

export async function learnFromFeedback(
  params: LearnFromFeedbackParams
): Promise<{ id?: string; queued?: string; skipped?: string }> {
  const { questionContext, actualResponse, suggestedResponse, conversationId, brand = 'both' } = params;
  const trimmed = actualResponse.trim();
  if (trimmed.length < MIN_RESPONSE_LENGTH) {
    return { skipped: 'resposta muito curta' };
  }

  const mode = await getLearnKbMode();
  if (mode === 'off') return { skipped: 'aprendizado desligado' };

  const brandVal = BRANDS.includes(brand) ? brand : 'both';

  try {
    // Normalizar deixou de ser opcional. O caminho "salvar cru" existia atrás de
    // uma opção e foi ele que transformou a base num arquivo de conversas.
    const entry = await normalize(questionContext, trimmed);
    if (!entry) return { skipped: 'nada reutilizável nesta correção' };

    const dup = await findDuplicate(entry.question_pattern, brandVal);

    if (mode === 'auto') {
      if (dup) {
        const id = await reinforceEntry(dup.id, entry.gold_response, dup.frequency);
        return id ? { id } : { skipped: 'falha ao reforçar' };
      }
      const { data, error } = await supabaseAdmin
        .from('knowledge_base')
        .insert({
          brand: brandVal,
          category: entry.category,
          question_pattern: entry.question_pattern,
          gold_response: entry.gold_response,
          frequency: 1,
          is_active: true,
          source: 'auto',
        })
        .select('id')
        .single();
      if (error) {
        console.warn('[IA learnFromFeedback] insert', error.message);
        return { skipped: error.message };
      }
      await storeEmbedding(data?.id, entry.question_pattern);
      return { id: data?.id };
    }

    // mode === 'queue': vira proposta e espera aprovação
    const { data, error } = await supabaseAdmin
      .from('kb_review_queue')
      .insert({
        conversation_id: conversationId ?? null,
        brand: brandVal,
        question_context: questionContext.slice(0, 4000),
        suggested_response: suggestedResponse?.slice(0, 8000) ?? null,
        actual_response: trimmed.slice(0, 8000),
        proposed_question_pattern: entry.question_pattern,
        proposed_gold_response: entry.gold_response,
        proposed_category: entry.category,
        duplicate_of: dup?.id ?? null,
        duplicate_similarity: dup?.similarity ?? null,
      })
      .select('id')
      .single();
    if (error) {
      console.warn('[IA learnFromFeedback] fila', error.message);
      return { skipped: error.message };
    }
    return { queued: data?.id };
  } catch (err) {
    console.error('[IA learnFromFeedback]', err);
    return { skipped: err instanceof Error ? err.message : 'erro' };
  }
}
