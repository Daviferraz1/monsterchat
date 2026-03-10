import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const rootEnv = path.resolve(process.cwd(), '../../.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
dotenv.config();
if (!process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Message {
  direction: 'inbound' | 'outbound';
  sender_type: string;
  body: string | null;
  content_type: string;
  created_at: string;
}

interface ClassificationResult {
  brand: string;
  category: string;
  subcategory: string;
  intent: string;
  sentiment: string;
  urgency: string;
  resolution_status: string;
  quality_score: number | null;
  quality_notes: string;
  human_response_pattern: string;
}

function parseJsonSafe<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY || !process.env.ANTHROPIC_API_KEY) {
    console.error('Erro: variáveis de ambiente ausentes. Configure o arquivo .env');
    process.exit(1);
  }

  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   TEST CLASSIFY — 5 conversas recentes   ║');
  console.log('╚═══════════════════════════════════════════╝\n');

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, contact_id, status, created_at, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(5);

  if (error || !conversations || conversations.length === 0) {
    console.error('Erro ao buscar conversas:', error?.message ?? 'Nenhuma conversa encontrada');
    process.exit(1);
  }

  console.log(`Encontradas ${conversations.length} conversas recentes.\n`);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i] as {
      id: string;
      contact_id: string | null;
      status: string;
      created_at: string;
      last_message_at: string;
    };

    console.log(`─── Conversa ${i + 1}/5 (ID: ${conv.id}) ───`);

    const { data: messages } = await supabase
      .from('messages')
      .select('direction, sender_type, body, content_type, created_at')
      .eq('conversation_id', conv.id)
      .eq('content_type', 'text')
      .not('body', 'is', null)
      .neq('body', '')
      .order('created_at', { ascending: true });

    if (!messages || messages.length === 0) {
      console.log('  Sem mensagens. Pulando.\n');
      continue;
    }

    const textMessages = (messages as Message[]).filter(m => m.body && m.body.trim());
    if (textMessages.length === 0) {
      console.log('  Sem mensagens de texto. Pulando.\n');
      continue;
    }

    let contactName = 'Desconhecido';
    let contactMeta: Record<string, unknown> | null = null;
    if (conv.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone, metadata')
        .eq('id', conv.contact_id)
        .single();
      if (contact) {
        contactName = (contact.name ?? contact.phone ?? 'Desconhecido') as string;
        contactMeta = contact.metadata as Record<string, unknown> | null;
      }
    }

    const conversationText = textMessages
      .map(m => {
        const ts = new Date(m.created_at).toLocaleString('pt-BR');
        const role = m.direction === 'inbound' ? 'ALUNO' : 'OPERADOR';
        return `[${ts}] ${role}: ${m.body}`;
      })
      .join('\n');

    const contactInfo = contactMeta
      ? `\nDADOS DO CONTATO: ${JSON.stringify(contactMeta)}`
      : '';

    const prompt = `Você é um analista de atendimento ao cliente para duas marcas brasileiras:
- MONSTER CONCURSOS: cursos preparatórios para concursos públicos (Monster Questões, Monster Study, Monster Sound). Pagamentos via Guru/Asaas.
- FAGENIUS: faculdade com Tecnólogo e Sequencial em Gestão de Segurança Pública. Sistema acadêmico Pincel Atômico.

Ambas operam pelo mesmo canal WhatsApp.${contactInfo}

Analise a conversa e retorne APENAS um JSON válido (sem markdown, sem backticks):
{
  "brand": "monster" | "fagenius" | "ambiguous",
  "category": "financeiro" | "acesso" | "matricula" | "academico" | "lead" | "tecnico" | "duvida" | "reclamacao" | "documento" | "outro",
  "subcategory": "string curta",
  "intent": "resumo em 1 frase",
  "sentiment": "positive" | "neutral" | "negative",
  "urgency": "low" | "medium" | "high",
  "resolution_status": "resolved" | "unresolved" | "abandoned" | "ongoing",
  "quality_score": 1-5 (qualidade da resposta do operador, null se não respondeu),
  "quality_notes": "observação breve",
  "human_response_pattern": "padrão resumido"
}

CONVERSA:
${conversationText}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const result = parseJsonSafe<ClassificationResult>(raw);

    console.log(`  Contato    : ${contactName}`);
    console.log(`  Mensagens  : ${textMessages.length} (${messages.length} total)`);
    console.log(`  Status     : ${conv.status}`);

    if (result) {
      const brandIcon = result.brand === 'monster' ? '🟠' : result.brand === 'fagenius' ? '🔵' : '⚪';
      const sentimentIcon = result.sentiment === 'positive' ? '😊' : result.sentiment === 'negative' ? '😞' : '😐';
      const urgencyIcon = result.urgency === 'high' ? '🔴' : result.urgency === 'medium' ? '🟡' : '🟢';

      console.log(`  ${brandIcon} Marca      : ${result.brand}`);
      console.log(`  📂 Categoria : ${result.category} (${result.subcategory})`);
      console.log(`  💡 Intenção  : ${result.intent}`);
      console.log(`  ${sentimentIcon} Sentimento : ${result.sentiment}`);
      console.log(`  ${urgencyIcon} Urgência   : ${result.urgency}`);
      console.log(`  📋 Status    : ${result.resolution_status}`);
      console.log(`  ⭐ Qualidade : ${result.quality_score ?? 'N/A'}/5 — ${result.quality_notes}`);
      console.log(`  👤 Padrão    : ${result.human_response_pattern}`);
    } else {
      console.log('  ⚠️  Falha ao parsear JSON da IA.');
      console.log(`  Resposta bruta: ${raw.slice(0, 200)}`);
    }

    const costUsd = (inputTokens * 0.00000080) + (outputTokens * 0.000004);
    console.log(`  🔢 Tokens    : ${inputTokens} in + ${outputTokens} out = $${costUsd.toFixed(6)} USD`);
    console.log();
  }

  const totalCostUsd = (totalInputTokens * 0.00000080) + (totalOutputTokens * 0.000004);
  const totalCostBrl = totalCostUsd * 5.8;

  console.log('═'.repeat(50));
  console.log('CUSTO TOTAL TESTE');
  console.log(`  Tokens : ${totalInputTokens} in + ${totalOutputTokens} out`);
  console.log(`  USD    : $${totalCostUsd.toFixed(5)}`);
  console.log(`  BRL    : R$ ${totalCostBrl.toFixed(4)}`);
  console.log();
  console.log('Se a classificação está correta, rode: npm run phase:all');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
