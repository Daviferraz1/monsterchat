import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
  return createClient(url, key);
}

function getAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY é obrigatório');
  return new Anthropic({ apiKey });
}

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

export interface SuggestionResult {
  confidence: 'high' | 'medium' | 'low' | 'none';
  suggestion: string | null;
  category: string | null;
  alternatives: Array<{
    question_pattern: string;
    gold_response: string;
    frequency: number;
    similarity: number;
  }>;
}

export interface FeedbackParams {
  conversationId: string;
  knowledgeEntryId?: string;
  suggestedResponse: string;
  confidence: number;
  wasUsed: boolean;
  wasEdited?: boolean;
  editedResponse?: string;
  operatorFeedback?: string;
}

function parseJsonSafe<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function similarityToConfidence(similarity: number): 'high' | 'medium' | 'low' | 'none' {
  if (similarity >= 0.5) return 'high';
  if (similarity >= 0.2) return 'medium';
  if (similarity > 0) return 'low';
  return 'none';
}

// ─────────────────────────────────────────────
// 1. classifyIncomingMessage
// ─────────────────────────────────────────────

export async function classifyIncomingMessage(
  conversationId: string,
  messageBody: string,
  contactName?: string
): Promise<void> {
  if (!messageBody.trim()) return;

  const supabase = getSupabase();
  const anthropic = getAnthropic();

  const prompt = `Você é um analista de atendimento ao cliente para duas marcas brasileiras:
- MONSTER CONCURSOS: cursos preparatórios para concursos públicos (Monster Questões, Monster Study, Monster Sound). Pagamentos via Guru/Asaas.
- FAGENIUS: faculdade com Tecnólogo e Sequencial em Gestão de Segurança Pública. Sistema acadêmico Pincel Atômico.

${contactName ? `Contato: ${contactName}` : ''}

Analise a mensagem e retorne APENAS um JSON válido (sem markdown, sem backticks):
{
  "brand": "monster" | "fagenius" | "ambiguous",
  "category": "financeiro" | "acesso" | "matricula" | "academico" | "lead" | "tecnico" | "duvida" | "reclamacao" | "documento" | "outro",
  "intent": "resumo em 1 frase",
  "sentiment": "positive" | "neutral" | "negative",
  "urgency": "low" | "medium" | "high"
}

MENSAGEM:
${messageBody}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const result = parseJsonSafe<{
      brand: string;
      category: string;
      intent: string;
      sentiment: string;
      urgency: string;
    }>(raw);

    if (!result) return;

    await supabase
      .from('conversation_analysis')
      .upsert({
        conversation_id: conversationId,
        brand: result.brand,
        category: result.category,
        intent: result.intent,
        sentiment: result.sentiment,
        urgency: result.urgency,
        resolution_status: 'ongoing',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' });
  } catch (err) {
    console.error('[classifyIncomingMessage] Erro:', err);
  }
}

// ─────────────────────────────────────────────
// 2. getSuggestion
// ─────────────────────────────────────────────

export async function getSuggestion(
  messageBody: string,
  brand?: string
): Promise<SuggestionResult> {
  if (!messageBody.trim()) {
    return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('search_knowledge_base', {
      search_text: messageBody,
      search_brand: brand ?? null,
      max_results: 3,
    });

    if (error || !data || data.length === 0) {
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
      alternatives: results.slice(1).map(r => ({
        question_pattern: r.question_pattern,
        gold_response: r.gold_response,
        frequency: r.frequency,
        similarity: r.similarity,
      })),
    };
  } catch (err) {
    console.error('[getSuggestion] Erro:', err);
    return { confidence: 'none', suggestion: null, category: null, alternatives: [] };
  }
}

// ─────────────────────────────────────────────
// 3. recordSuggestionFeedback
// ─────────────────────────────────────────────

export async function recordSuggestionFeedback(params: FeedbackParams): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.from('response_suggestions').insert({
      conversation_id: params.conversationId,
      knowledge_entry_id: params.knowledgeEntryId ?? null,
      suggested_response: params.suggestedResponse,
      confidence: params.confidence,
      was_used: params.wasUsed,
      was_edited: params.wasEdited ?? false,
      edited_response: params.editedResponse ?? null,
      operator_feedback: params.operatorFeedback ?? null,
    });
  } catch (err) {
    console.error('[recordSuggestionFeedback] Erro:', err);
  }
}

// ─────────────────────────────────────────────
// 4. weeklyImprovement
// ─────────────────────────────────────────────

export async function weeklyImprovement(): Promise<void> {
  console.log('\n[weeklyImprovement] Iniciando melhoria semanal...');

  const supabase = getSupabase();
  const anthropic = getAnthropic();

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const { data: editedSuggestions, error } = await supabase
    .from('response_suggestions')
    .select(`
      id,
      knowledge_entry_id,
      suggested_response,
      edited_response,
      operator_feedback,
      created_at
    `)
    .eq('was_edited', true)
    .gte('created_at', oneWeekAgo.toISOString())
    .not('edited_response', 'is', null);

  if (error || !editedSuggestions || editedSuggestions.length === 0) {
    console.log('[weeklyImprovement] Nenhuma edição encontrada na última semana.');
    return;
  }

  console.log(`[weeklyImprovement] ${editedSuggestions.length} sugestões editadas encontradas.`);

  interface EditedSuggestion {
    id: string;
    knowledge_entry_id: string | null;
    suggested_response: string;
    edited_response: string;
    operator_feedback: string | null;
  }

  const grouped: Record<string, EditedSuggestion[]> = {};
  for (const s of editedSuggestions as EditedSuggestion[]) {
    if (!s.knowledge_entry_id) continue;
    if (!grouped[s.knowledge_entry_id]) grouped[s.knowledge_entry_id] = [];
    grouped[s.knowledge_entry_id].push(s);
  }

  let improved = 0;

  for (const [entryId, edits] of Object.entries(grouped)) {
    const { data: entry } = await supabase
      .from('knowledge_base')
      .select('question_pattern, gold_response, brand, category')
      .eq('id', entryId)
      .single();

    if (!entry) continue;

    const editSamples = edits
      .map((e, i) => `--- Edição ${i + 1} ---\nOriginal: ${e.suggested_response}\nEditado pelo operador: ${e.edited_response}${e.operator_feedback ? `\nFeedback: ${e.operator_feedback}` : ''}`)
      .join('\n\n');

    const prompt = `Você é um especialista em atendimento ao cliente.

MARCA: ${entry.brand} | CATEGORIA: ${entry.category}
PERGUNTA-TIPO: ${entry.question_pattern}

RESPOSTA ATUAL NA BASE:
${entry.gold_response}

O operador humano editou a resposta sugerida ${edits.length} vez(es) esta semana:
${editSamples}

TAREFA: Crie uma nova "resposta ouro" melhorada, incorporando o que o operador corrigiu.

REGRAS:
- Mantenha o tom adequado (Monster=informal/emoji, FAGENIUS=formal)
- Máximo 3 parágrafos
- Use {nome_aluno} como variável
- Nunca invente informações

Retorne APENAS o texto da nova resposta (sem JSON, sem markdown).`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const newResponse = response.content[0].type === 'text'
        ? response.content[0].text.trim()
        : null;

      if (!newResponse) continue;

      await supabase
        .from('knowledge_base')
        .update({
          gold_response: newResponse,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entryId);

      improved++;
      console.log(`  ✓ Entrada melhorada: ${(entry.question_pattern as string).slice(0, 60)}...`);
    } catch (err) {
      console.error(`  Erro ao melhorar entrada ${entryId}:`, err);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n[weeklyImprovement] Concluído. ${improved} entradas melhoradas.\n`);
}
