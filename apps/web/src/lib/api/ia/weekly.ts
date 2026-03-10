import Anthropic from '@anthropic-ai/sdk';
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';

/**
 * Melhora a base de conhecimento com base nas edições da última semana.
 * Chamado pelo cron semanal (Vercel).
 */
export async function weeklyImprovement(): Promise<{ improved: number }> {
  if (!apiEnv.ANTHROPIC_API_KEY) {
    console.log('[IA weeklyImprovement] ANTHROPIC_API_KEY não configurado.');
    return { improved: 0 };
  }

  const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const { data: editedSuggestions, error } = await supabaseAdmin
    .from('response_suggestions')
    .select('id, knowledge_entry_id, suggested_response, edited_response, operator_feedback')
    .eq('was_edited', true)
    .gte('created_at', oneWeekAgo.toISOString())
    .not('edited_response', 'is', null);

  if (error || !editedSuggestions?.length) {
    return { improved: 0 };
  }

  interface EditedRow {
    knowledge_entry_id: string | null;
    suggested_response: string;
    edited_response: string;
    operator_feedback: string | null;
  }

  const grouped: Record<string, EditedRow[]> = {};
  for (const s of editedSuggestions as EditedRow[]) {
    if (!s.knowledge_entry_id) continue;
    if (!grouped[s.knowledge_entry_id]) grouped[s.knowledge_entry_id] = [];
    grouped[s.knowledge_entry_id].push(s);
  }

  let improved = 0;

  for (const [entryId, edits] of Object.entries(grouped)) {
    const { data: entry } = await supabaseAdmin
      .from('knowledge_base')
      .select('question_pattern, gold_response, brand, category')
      .eq('id', entryId)
      .single();

    if (!entry) continue;

    const editSamples = edits
      .map(
        (e, i) =>
          `--- Edição ${i + 1} ---\nOriginal: ${e.suggested_response}\nEditado: ${e.edited_response}${e.operator_feedback ? `\nFeedback: ${e.operator_feedback}` : ''}`
      )
      .join('\n\n');

    const prompt = `Você é um especialista em atendimento ao cliente.

MARCA: ${entry.brand} | CATEGORIA: ${entry.category}
PERGUNTA-TIPO: ${entry.question_pattern}

RESPOSTA ATUAL NA BASE:
${entry.gold_response}

O operador editou a resposta sugerida ${edits.length} vez(es) esta semana:
${editSamples}

TAREFA: Crie uma nova "resposta ouro" melhorada, incorporando as correções do operador.
REGRAS: Tom adequado (Monster=informal, FAGENIUS=formal). Máx 3 parágrafos. Use {nome_aluno}. Nunca invente informações.
Retorne APENAS o texto da nova resposta (sem JSON, sem markdown).`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const newResponse = response.content[0].type === 'text' ? response.content[0].text.trim() : null;
      if (!newResponse) continue;

      await supabaseAdmin
        .from('knowledge_base')
        .update({ gold_response: newResponse, updated_at: new Date().toISOString() })
        .eq('id', entryId);

      improved++;
    } catch (err) {
      console.error('[IA weeklyImprovement] entry', entryId, err);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  return { improved };
}
