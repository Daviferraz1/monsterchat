import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../supabase';
import { apiEnv } from '../env';
import { isLearnFromFeedbackUseAi } from './autopilot';
import { embedText, isEmbeddingsEnabled } from './embeddings';

/** Gera e grava o embedding da pergunta-tipo para que a nova entrada seja localizável na busca semântica. */
async function storeEmbedding(id: string | undefined, text: string): Promise<void> {
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

const CATEGORIES = ['financeiro', 'acesso', 'matricula', 'academico', 'lead', 'tecnico', 'duvida', 'reclamacao', 'documento', 'outro'] as const;
const BRANDS = ['monster', 'fagenius', 'both'] as const;

export interface LearnFromFeedbackParams {
  /** Pergunta/dúvida do aluno (contexto da conversa). */
  questionContext: string;
  /** Resposta que o atendente realmente enviou. */
  actualResponse: string;
  brand?: 'monster' | 'fagenius' | 'both';
}

/** Resposta estruturada da IA para criar entrada na base de conhecimento. */
interface NormalizedEntry {
  question_pattern: string;
  gold_response: string;
  category: string;
}

const MIN_RESPONSE_LENGTH = 15;

/**
 * Quando o atendente não usa a sugestão, salva na base de conhecimento.
 * Se a opção "Usar IA" estiver ativa (settings/ia), usa Claude para normalizar pergunta e resposta.
 * Se estiver desativada, salva direto (pergunta e resposta como estão).
 */
export async function learnFromFeedback(params: LearnFromFeedbackParams): Promise<{ id?: string; skipped?: string }> {
  const { questionContext, actualResponse, brand = 'both' } = params;
  const trimmed = actualResponse.trim();
  if (trimmed.length < MIN_RESPONSE_LENGTH) {
    return { skipped: 'resposta muito curta' };
  }

  const useAi = await isLearnFromFeedbackUseAi();
  const brandVal = BRANDS.includes(brand) ? brand : 'both';

  if (!useAi) {
    const questionPattern = questionContext.trim().slice(0, 1000) || 'Pergunta do aluno';
    const { data, error } = await supabaseAdmin
      .from('knowledge_base')
      .insert({
        brand: brandVal,
        category: 'outro',
        question_pattern: questionPattern,
        gold_response: trimmed.slice(0, 8000),
        frequency: 1,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) {
      console.warn('[IA learnFromFeedback] insert (sem IA)', error.message);
      return { skipped: error.message };
    }
    await storeEmbedding(data?.id, questionPattern);
    return { id: data?.id };
  }

  if (!apiEnv.ANTHROPIC_API_KEY) {
    return { skipped: 'sem API key' };
  }

  try {
    const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `Você é um assistente que prepara entradas para uma base de conhecimento de atendimento.

Sua tarefa: a partir da pergunta/dúvida do aluno e da resposta que o atendente enviou, produzir UMA entrada normalizada em JSON com exatamente estes campos:
- question_pattern: string com a pergunta resumida/normalizada em uma frase curta e genérica (ex.: "Qual o valor do curso?", "Como acesso o material?"). Sem saudações nem contexto do aluno.
- gold_response: string com a resposta de ouro, baseada no que o atendente escreveu. Pode corrigir pequenos erros e deixar o texto claro e reutilizável. Mantenha tom humano e em português brasileiro.
- category: uma das categorias exatas: ${CATEGORIES.join(', ')}.

Responda APENAS com um JSON válido, sem markdown e sem texto antes ou depois. Exemplo:
{"question_pattern":"Qual o valor do curso?","gold_response":"Oi! O valor à vista é R$ 497. Você pode pagar com boleto, Pix ou cartão. No cartão pode parcelar.","category":"lead"}`,
      messages: [
        {
          role: 'user',
          content: `Pergunta/dúvida do aluno:\n${questionContext.slice(0, 2000)}\n\nResposta enviada pelo atendente:\n${trimmed.slice(0, 3000)}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { skipped: 'IA não retornou JSON' };
    }

    let entry: NormalizedEntry;
    try {
      entry = JSON.parse(jsonMatch[0]) as NormalizedEntry;
    } catch {
      return { skipped: 'JSON inválido' };
    }

    if (!entry.question_pattern?.trim() || !entry.gold_response?.trim()) {
      return { skipped: 'campos vazios' };
    }
    const category = CATEGORIES.includes(entry.category as (typeof CATEGORIES)[number])
      ? entry.category
      : 'outro';

    const { data, error } = await supabaseAdmin
      .from('knowledge_base')
      .insert({
        brand: brandVal,
        category,
        question_pattern: entry.question_pattern.trim().slice(0, 1000),
        gold_response: entry.gold_response.trim().slice(0, 8000),
        frequency: 1,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[IA learnFromFeedback] insert', error.message);
      return { skipped: error.message };
    }
    await storeEmbedding(data?.id, entry.question_pattern.trim());
    return { id: data?.id };
  } catch (err) {
    console.error('[IA learnFromFeedback]', err);
    return { skipped: err instanceof Error ? err.message : 'erro' };
  }
}
