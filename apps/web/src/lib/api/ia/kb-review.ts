/**
 * Curadoria da base de conhecimento.
 *
 * Cada correção que o atendente faz numa sugestão vira uma proposta aqui. Só o
 * que for aprovado entra na base — foi a entrada automática e sem revisão que
 * transformou a base num arquivo de 17 mil conversas (ver migração 046).
 *
 * Aprovar tem dois desfechos: criar entrada nova, ou REFORÇAR uma existente
 * quando a pergunta já está lá (similaridade ≥ 0.9). Reforçar mantém a base
 * enxuta e faz a frequência subir, que é o sinal de "isso o aluno pergunta
 * muito" usado no ranking da busca.
 */
import { supabaseAdmin } from '../supabase';
import { findDuplicate, reinforceEntry, storeEmbedding } from './learn-from-feedback';

export interface ReviewItem {
  id: string;
  conversation_id: string | null;
  brand: string;
  question_context: string;
  suggested_response: string | null;
  actual_response: string;
  proposed_question_pattern: string;
  proposed_gold_response: string;
  proposed_category: string;
  duplicate_of: string | null;
  duplicate_similarity: number | null;
  status: string;
  created_at: string;
}

export interface ReviewItemWithDuplicate extends ReviewItem {
  /** A entrada que esta proposta reforçaria, para o revisor comparar antes de aprovar. */
  duplicate?: { id: string; question_pattern: string; gold_response: string; frequency: number } | null;
}

export async function listPending(limit = 30): Promise<ReviewItemWithDuplicate[]> {
  const { data, error } = await supabaseAdmin
    .from('kb_review_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[IA kb-review] listPending', error.message);
    return [];
  }

  const items = (data ?? []) as ReviewItem[];
  const dupIds = items.map((i) => i.duplicate_of).filter((v): v is string => !!v);
  if (!dupIds.length) return items;

  const { data: dups } = await supabaseAdmin
    .from('knowledge_base')
    .select('id, question_pattern, gold_response, frequency')
    .in('id', dupIds);
  const byId = new Map((dups ?? []).map((d) => [d.id, d]));

  return items.map((i) => ({ ...i, duplicate: i.duplicate_of ? byId.get(i.duplicate_of) ?? null : null }));
}

export async function countPending(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('kb_review_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

export interface ApproveInput {
  id: string;
  reviewerId: string;
  /** O revisor pode corrigir o texto antes de aprovar — é o ponto da curadoria. */
  questionPattern?: string;
  goldResponse?: string;
  category?: string;
  /** Força criar entrada nova mesmo havendo duplicata sugerida. */
  forceNew?: boolean;
}

export async function approve(input: ApproveInput): Promise<{ knowledgeBaseId: string } | { error: string }> {
  const { data: item, error } = await supabaseAdmin
    .from('kb_review_queue')
    .select('*')
    .eq('id', input.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (error || !item) return { error: 'Proposta não encontrada ou já revisada' };

  const questionPattern = (input.questionPattern ?? item.proposed_question_pattern).trim().slice(0, 1000);
  const goldResponse = (input.goldResponse ?? item.proposed_gold_response).trim().slice(0, 8000);
  const category = input.category ?? item.proposed_category;
  if (!questionPattern || !goldResponse) return { error: 'Pergunta e resposta não podem ficar vazias' };

  // A duplicata é reconferida na hora de aprovar: a proposta pode ter ficado dias
  // na fila e a base mudou nesse meio-tempo. Se o revisor editou a pergunta, a
  // duplicata registrada na criação também já não vale.
  const editouPergunta = questionPattern !== item.proposed_question_pattern;
  const dup = input.forceNew
    ? null
    : editouPergunta
      ? await findDuplicate(questionPattern, item.brand)
      : item.duplicate_of
        ? await findDuplicate(questionPattern, item.brand)
        : null;

  let knowledgeBaseId: string;

  if (dup) {
    const reforcada = await reinforceEntry(dup.id, goldResponse, dup.frequency);
    if (!reforcada) return { error: 'Falha ao reforçar a entrada existente' };
    knowledgeBaseId = reforcada;
    // Curada por gente: promove a entrada antiga, que provavelmente era 'legacy'.
    await supabaseAdmin.from('knowledge_base').update({ source: 'curated' }).eq('id', dup.id);
  } else {
    const { data: created, error: insertError } = await supabaseAdmin
      .from('knowledge_base')
      .insert({
        brand: item.brand,
        category,
        question_pattern: questionPattern,
        gold_response: goldResponse,
        frequency: 1,
        is_active: true,
        source: 'curated',
      })
      .select('id')
      .single();
    if (insertError || !created) return { error: insertError?.message ?? 'Falha ao criar a entrada' };
    knowledgeBaseId = created.id;
    await storeEmbedding(created.id, questionPattern);
  }

  await supabaseAdmin
    .from('kb_review_queue')
    .update({
      status: 'approved',
      reviewed_by: input.reviewerId,
      reviewed_at: new Date().toISOString(),
      knowledge_base_id: knowledgeBaseId,
      proposed_question_pattern: questionPattern,
      proposed_gold_response: goldResponse,
      proposed_category: category,
    })
    .eq('id', input.id);

  return { knowledgeBaseId };
}

export async function reject(id: string, reviewerId: string, note?: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('kb_review_queue')
    .update({
      status: 'rejected',
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note?.slice(0, 500) ?? null,
    })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) {
    console.error('[IA kb-review] reject', error.message);
    return false;
  }
  return true;
}
