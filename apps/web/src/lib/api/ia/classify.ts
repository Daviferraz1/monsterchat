import Anthropic from '@anthropic-ai/sdk';
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';

function parseJsonSafe<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

/**
 * Classifica mensagem recebida (inbound) e faz upsert em conversation_analysis.
 * Só roda se ANTHROPIC_API_KEY estiver configurado.
 * Quando contactMetadata tem digital_guru.products (canal Guru), a IA usa para precisão Monster vs FAGENIUS.
 */
export async function classifyIncomingMessage(
  conversationId: string,
  messageBody: string,
  contactName?: string,
  contactMetadata?: Record<string, unknown> | null
): Promise<void> {
  if (!messageBody?.trim()) return;
  if (!apiEnv.ANTHROPIC_API_KEY) return;

  const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });

  const contactInfo = contactMetadata ? `\nDADOS DO CONTATO: ${JSON.stringify(contactMetadata)}` : '';
  const guruHint =
    contactMetadata &&
    typeof (contactMetadata as { digital_guru?: { products?: unknown } }).digital_guru?.products !== 'undefined'
      ? '\nIMPORTANTE: O contato tem digital_guru.products no metadata (canal Guru). Use para classificação: aluno Monster, curso/produto comprado, status de pagamento. Melhora precisão Monster vs FAGENIUS.'
      : '';

  const prompt = `Você é um analista de atendimento ao cliente para duas marcas brasileiras:
- MONSTER CONCURSOS: cursos preparatórios para concursos públicos (Monster Questões, Monster Study, Monster Sound). Pagamentos via Guru/Asaas.
- FAGENIUS: faculdade com Tecnólogo e Sequencial em Gestão de Segurança Pública. Sistema acadêmico Pincel Atômico.

${contactName ? `Contato: ${contactName}` : ''}${contactInfo}${guruHint}

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
    const result = parseJsonSafe<{ brand: string; category: string; intent: string; sentiment: string; urgency: string }>(raw);
    if (!result) return;

    await supabaseAdmin.from('conversation_analysis').upsert(
      {
        conversation_id: conversationId,
        brand: result.brand,
        category: result.category,
        intent: result.intent,
        sentiment: result.sentiment,
        urgency: result.urgency,
        resolution_status: 'ongoing',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'conversation_id' }
    );
  } catch (err) {
    console.error('[IA classifyIncomingMessage]', err);
  }
}
