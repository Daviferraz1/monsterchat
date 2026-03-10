import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Caminho do diretório deste arquivo (apps/ia-atendimento/src) — não depende de process.cwd()
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  const parsed = dotenv.parse(content);
  Object.assign(process.env, parsed);
}

// Raiz do monorepo = 3 níveis acima de src (src -> ia-atendimento -> apps -> raiz)
const rootDir = path.resolve(__dirname, '../../..');
loadEnvFile(path.join(rootDir, '.env'));
loadEnvFile(path.join(rootDir, 'apps/web/.env'));
loadEnvFile(path.join(__dirname, '../.env')); // apps/ia-atendimento/.env
dotenv.config();

// Aceitar SUPABASE_SERVICE_ROLE_KEY (usado no .env da raiz) como alias de SUPABASE_SERVICE_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  supabaseServiceKey!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────

interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender_type: 'contact' | 'agent' | 'system';
  body: string | null;
  content_type: string;
  created_at: string;
}

interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
  metadata: Record<string, unknown> | null;
}

interface Conversation {
  id: string;
  contact_id: string | null;
  status: string;
  created_at: string;
}

interface ClassificationResult {
  brand: 'monster' | 'fagenius' | 'ambiguous';
  category: 'financeiro' | 'acesso' | 'matricula' | 'academico' | 'lead' | 'tecnico' | 'duvida' | 'reclamacao' | 'documento' | 'outro';
  subcategory: string;
  intent: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: 'low' | 'medium' | 'high';
  resolution_status: 'resolved' | 'unresolved' | 'abandoned' | 'ongoing';
  quality_score: number | null;
  quality_notes: string;
  human_response_pattern: string;
}

interface KnowledgeEntry {
  question_pattern: string;
  question_variations: string[];
  gold_response: string;
  best_human_response: string;
  frequency: number;
  tags: string[];
  decision_tree: string | null;
}

// ─────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────

function parseJsonSafe<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Timeout para chamadas à API (evita travar para sempre). */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${message} (timeout ${ms / 1000}s)`)), ms)
    ),
  ]);
}

function formatConversationText(messages: Message[], _contact: Contact | null): string {
  return messages
    .filter(m => m.body && m.body.trim())
    .map(m => {
      const ts = new Date(m.created_at).toLocaleString('pt-BR');
      const role = m.direction === 'inbound' ? 'ALUNO' : 'OPERADOR';
      return `[${ts}] ${role}: ${m.body}`;
    })
    .join('\n');
}

// ─────────────────────────────────────────────
// FASE 1 — Classificar conversas
// ─────────────────────────────────────────────

async function classifyConversation(
  messages: Message[],
  contact: Contact | null
): Promise<ClassificationResult | null> {
  const conversationText = formatConversationText(messages, contact);
  if (!conversationText.trim()) return null;

  const contactInfo = contact?.metadata
    ? `\nDADOS DO CONTATO: ${JSON.stringify(contact.metadata)}`
    : '';

  const guruHint = contact?.metadata && typeof (contact.metadata as { digital_guru?: { products?: unknown } }).digital_guru?.products !== 'undefined'
    ? '\nIMPORTANTE: O contato tem digital_guru.products no metadata (canal Guru). Use esses dados para classificação: identificar se é aluno Monster, qual curso/produto comprou e status de pagamento. Isso melhora a precisão entre Monster vs FAGENIUS.'
    : '';

  const prompt = `Você é um analista de atendimento ao cliente para duas marcas brasileiras:
- MONSTER CONCURSOS: cursos preparatórios para concursos públicos (Monster Questões, Monster Study, Monster Sound). Pagamentos via Guru/Asaas.
- FAGENIUS: faculdade com Tecnólogo e Sequencial em Gestão de Segurança Pública. Sistema acadêmico Pincel Atômico.

Ambas operam pelo mesmo canal WhatsApp.${contactInfo}${guruHint}

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

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseJsonSafe<ClassificationResult>(raw);
}

async function runPhase1() {
  console.log('\n═══════════════════════════════════════');
  console.log('FASE 1 — Classificando conversas...');
  console.log('═══════════════════════════════════════\n');

  const { data: analyzed } = await supabase
    .from('conversation_analysis')
    .select('conversation_id');
  const analyzedIds = new Set((analyzed ?? []).map((r: { conversation_id: string }) => r.conversation_id));

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, contact_id, status, created_at')
    .order('created_at', { ascending: true });

  if (error || !conversations) {
    console.error('Erro ao buscar conversas:', error);
    return;
  }

  const pending = (conversations as Conversation[]).filter(c => !analyzedIds.has(c.id));
  console.log(`Total: ${conversations.length} | Pendentes: ${pending.length}`);
  if (pending.length > 0) {
    console.log('  Processando... (a primeira conversa pode levar ~10–15s até aparecer o contador)\n');
  }

  // Anthropic: 50 req/min para Haiku — processar 1 por vez a cada 1,5s ≈ 40/min para não estourar
  const DELAY_BETWEEN_REQUESTS_MS = 1500;
  const RETRY_WAIT_429_MS = 65000;
  const MAX_RETRIES_429 = 10; // por conversa
  const API_TIMEOUT_MS = 90000; // 90s — conversas muito longas podem demorar
  let processed = 0;
  let skipped = 0;

  for (let idx = 0; idx < pending.length; idx++) {
    const conv = pending[idx];
    const progress = `[${idx + 1}/${pending.length}]`;
    process.stdout.write(`\r  ${progress} Buscando mensagens...   `);
    let success = false;
    for (let attempt = 0; attempt < MAX_RETRIES_429 && !success; attempt++) {
      try {
        const { data: messages } = await supabase
          .from('messages')
          .select('id, conversation_id, direction, sender_type, body, content_type, created_at')
          .eq('conversation_id', conv.id)
          .eq('content_type', 'text')
          .not('body', 'is', null)
          .neq('body', '')
          .order('created_at', { ascending: true });

        if (!messages || messages.length === 0) {
          skipped++;
          success = true;
          break;
        }

        const textMessages = (messages as Message[]).filter(m => m.body && m.body.trim());
        if (textMessages.length === 0) {
          skipped++;
          success = true;
          break;
        }

        let contact: Contact | null = null;
        if (conv.contact_id) {
          const { data: c } = await supabase
            .from('contacts')
            .select('id, name, phone, metadata')
            .eq('id', conv.contact_id)
            .single();
          contact = c;
        }

        const inboundMsgs = (messages as Message[]).filter(m => m.direction === 'inbound');
        const agentMsgs = (messages as Message[]).filter(m => m.direction === 'outbound' && m.sender_type === 'agent');

        let responseTimeSeconds: number | null = null;
        if (inboundMsgs.length > 0 && agentMsgs.length > 0) {
          const firstInbound = new Date(inboundMsgs[0].created_at).getTime();
          const firstAgent = new Date(agentMsgs[0].created_at).getTime();
          responseTimeSeconds = Math.round((firstAgent - firstInbound) / 1000);
          if (responseTimeSeconds < 0) responseTimeSeconds = null;
        }

        const allMsgs = messages as Message[];
        let resolutionTimeSeconds: number | null = null;
        if (allMsgs.length >= 2) {
          const first = new Date(allMsgs[0].created_at).getTime();
          const last = new Date(allMsgs[allMsgs.length - 1].created_at).getTime();
          resolutionTimeSeconds = Math.round((last - first) / 1000);
        }

        const turnCount = inboundMsgs.length;
        const messageCount = allMsgs.length;

        process.stdout.write(`\r  ${progress} Chamando IA (pode levar 15–60s)...   `);
        let result: ClassificationResult | null = null;
        try {
          result = await withTimeout(
            classifyConversation(textMessages, contact),
            API_TIMEOUT_MS,
            'Resposta da API não chegou'
          );
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('credit') || msg.includes('balance') || msg.includes('too low')) {
            console.error('\n\n⚠️  Saldo de créditos Anthropic insuficiente.');
            console.error('   Adicione créditos em https://console.anthropic.com/ → Plans & Billing\n');
            throw err;
          }
          if (status === 429) {
            console.warn(`\n  ⏳ Limite de taxa (50/min). Aguardando ${RETRY_WAIT_429_MS / 1000}s... (tentativa ${attempt + 1}/${MAX_RETRIES_429})`);
            await sleep(RETRY_WAIT_429_MS);
            continue; // próxima tentativa
          }
          throw err;
        }

        if (!result) {
          skipped++;
          success = true;
          break;
        }

        const { error: insertError } = await supabase
          .from('conversation_analysis')
          .upsert({
            conversation_id: conv.id,
            brand: result.brand,
            category: result.category,
            subcategory: result.subcategory,
            intent: result.intent,
            sentiment: result.sentiment,
            urgency: result.urgency,
            resolution_status: result.resolution_status,
            quality_score: result.quality_score,
            quality_notes: result.quality_notes,
            human_response_pattern: result.human_response_pattern,
            response_time_seconds: responseTimeSeconds,
            resolution_time_seconds: resolutionTimeSeconds,
            turn_count: turnCount,
            message_count: messageCount,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'conversation_id' });

        if (insertError) {
          console.error(`Erro ao salvar análise da conversa ${conv.id}:`, insertError.message);
        } else {
          processed++;
          process.stdout.write(`\r  Processadas: ${processed} | Puladas: ${skipped} | ${idx + 1}/${pending.length}`);
        }
        success = true;
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 429 && attempt < MAX_RETRIES_429 - 1) {
          console.warn(`\n  ⏳ Limite de taxa. Aguardando ${RETRY_WAIT_429_MS / 1000}s...`);
          await sleep(RETRY_WAIT_429_MS);
        } else {
          throw err;
        }
      }
    }

    // Pausa entre uma conversa e outra para não estourar 50 req/min
    if (idx < pending.length - 1) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS);
    }
  }

  console.log(`\n\nFASE 1 concluída. Processadas: ${processed} | Puladas: ${skipped}\n`);
}

// ─────────────────────────────────────────────
// FASE 2 — Gerar base de conhecimento
// ─────────────────────────────────────────────

async function runPhase2() {
  console.log('═══════════════════════════════════════');
  console.log('FASE 2 — Gerando base de conhecimento...');
  console.log('═══════════════════════════════════════\n');

  const { data: analyses, error } = await supabase
    .from('conversation_analysis')
    .select('conversation_id, brand, category');

  if (error || !analyses) {
    console.error('Erro ao buscar análises:', error);
    return;
  }

  type GroupKey = string;
  const groups: Record<GroupKey, { brand: string; category: string; ids: string[] }> = {};

  for (const a of analyses as Array<{ conversation_id: string; brand: string; category: string }>) {
    const key = `${a.brand}__${a.category}`;
    if (!groups[key]) {
      groups[key] = { brand: a.brand, category: a.category, ids: [] };
    }
    groups[key].ids.push(a.conversation_id);
  }

  let totalEntries = 0;

  for (const [key, group] of Object.entries(groups)) {
    if (group.ids.length < 2) continue;

    console.log(`  Processando: ${group.brand}/${group.category} (${group.ids.length} conversas)`);

    const sampleIds = group.ids.slice(0, 20);
    const conversationTexts: string[] = [];

    for (const convId of sampleIds) {
      const { data: messages } = await supabase
        .from('messages')
        .select('direction, sender_type, body, created_at')
        .eq('conversation_id', convId)
        .eq('content_type', 'text')
        .not('body', 'is', null)
        .neq('body', '')
        .order('created_at', { ascending: true });

      if (!messages) continue;
      const text = (messages as Message[])
        .filter(m => m.body && m.body.trim())
        .map(m => {
          const role = m.direction === 'inbound' ? 'ALUNO' : 'OPERADOR';
          return `${role}: ${m.body}`;
        })
        .join('\n');

      if (text.trim()) conversationTexts.push(text);
    }

    if (conversationTexts.length === 0) continue;

    const brandLabel = group.brand === 'monster'
      ? 'MONSTER CONCURSOS (informal, motivacional, usa emoji)'
      : group.brand === 'fagenius'
        ? 'FAGENIUS (formal, acadêmico)'
        : 'Ambas as marcas';

    const prompt = `Você é um especialista em atendimento ao cliente analisando conversas reais.

MARCAS:
- MONSTER CONCURSOS: cursos preparatórios. Tom: informal, motivacional, usa emoji.
- FAGENIUS: faculdade Gestão Segurança Pública. Tom: formal, acadêmico.

CONTEXTO ATUAL: Marca = ${brandLabel}, Categoria = ${group.category}

TAREFA:
Analise as conversas da categoria "${group.category}" e:
1. Identifique PERGUNTAS-TIPO que se repetem
2. Para cada uma, crie RESPOSTA OURO (melhor versão combinando as humanas)
3. Identifique DUPLICIDADES
4. Crie ÁRVORE DE DECISÃO para fluxos complexos

Retorne APENAS JSON array (sem markdown, sem backticks):
[{
  "question_pattern": "pergunta-tipo",
  "question_variations": ["var1", "var2"],
  "gold_response": "resposta ouro com tom adequado",
  "best_human_response": "melhor resposta humana encontrada",
  "frequency": N,
  "tags": ["tag1"],
  "decision_tree": "SE ... → ..." ou null
}]

REGRAS da resposta ouro:
- Completa mas concisa (máx 3 parágrafos)
- Tom adequado: Monster=informal / FAGENIUS=formal
- Use {nome_aluno} como variável
- Nunca invente informações acadêmicas ou financeiras

CONVERSAS:
${conversationTexts.map((t, i) => `--- Conversa ${i + 1} ---\n${t}`).join('\n\n')}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const entries = parseJsonSafe<KnowledgeEntry[]>(raw);

    if (!entries || !Array.isArray(entries)) {
      console.log(`    Falha ao parsear resposta para ${key}`);
      await sleep(2000);
      continue;
    }

    for (const entry of entries) {
      const { error: insertError } = await supabase
        .from('knowledge_base')
        .insert({
          brand: group.brand === 'ambiguous' ? 'both' : group.brand,
          category: group.category,
          question_pattern: entry.question_pattern,
          question_variations: entry.question_variations ?? [],
          gold_response: entry.gold_response,
          best_human_response: entry.best_human_response ?? null,
          frequency: entry.frequency ?? 1,
          tags: entry.tags ?? [],
          decision_tree: entry.decision_tree ?? null,
          is_active: true,
        });

      if (!insertError) totalEntries++;
    }

    console.log(`    → ${entries.length} entradas geradas`);
    await sleep(2000);
  }

  console.log(`\nFASE 2 concluída. Total de entradas na base: ${totalEntries}\n`);
}

// ─────────────────────────────────────────────
// FASE 3 — Relatório
// ─────────────────────────────────────────────

interface BrandSummaryRow {
  brand: string;
  total: number;
  avg_quality: number;
  avg_response_time_s: number;
  negative_count: number;
  positive_count: number;
}

interface CategorySummaryRow {
  category: string;
  brand: string;
  total: number;
  avg_quality: number;
  avg_response_time_s: number;
  resolved: number;
  abandoned: number;
}

interface TopQuestionRow {
  brand: string;
  category: string;
  question_pattern: string;
  frequency: number;
  response_preview: string;
}

interface NeedsAttentionRow {
  contact_name: string | null;
  brand: string;
  category: string;
  quality_score: number | null;
  quality_notes: string;
}

async function runPhase3() {
  console.log('═══════════════════════════════════════');
  console.log('FASE 3 — Gerando relatório...');
  console.log('═══════════════════════════════════════\n');

  const [
    { data: analyses },
    { data: knowledgeBase },
    { data: brandSummary },
    { data: categorySummary },
    { data: topQuestions },
    { data: needsAttention },
  ] = await Promise.all([
    supabase.from('conversation_analysis').select('*'),
    supabase.from('knowledge_base').select('id').eq('is_active', true),
    supabase.from('v_brand_summary').select('*'),
    supabase.from('v_category_summary').select('*'),
    supabase.from('v_top_questions').select('*').limit(20),
    supabase.from('v_needs_attention').select('*').limit(50),
  ]);

  const totalConversations = analyses?.length ?? 0;
  const totalKnowledge = knowledgeBase?.length ?? 0;

  const analysesWithQuality = (analyses ?? []).filter((a: { quality_score: number | null }) => a.quality_score != null);
  const avgQuality = analysesWithQuality.length > 0
    ? analysesWithQuality.reduce((sum: number, a: { quality_score: number }) => sum + a.quality_score, 0) / analysesWithQuality.length
    : 0;

  const analysesWithResponse = (analyses ?? []).filter((a: { response_time_seconds: number | null }) => a.response_time_seconds != null);
  const avgResponse = analysesWithResponse.length > 0
    ? analysesWithResponse.reduce((sum: number, a: { response_time_seconds: number }) => sum + a.response_time_seconds, 0) / analysesWithResponse.length
    : 0;

  const sentiments = {
    positive: (analyses ?? []).filter((a: { sentiment: string }) => a.sentiment === 'positive').length,
    neutral: (analyses ?? []).filter((a: { sentiment: string }) => a.sentiment === 'neutral').length,
    negative: (analyses ?? []).filter((a: { sentiment: string }) => a.sentiment === 'negative').length,
  };

  const today = new Date().toISOString().split('T')[0];
  const brandRows = (brandSummary ?? []) as BrandSummaryRow[];
  for (const bs of brandRows) {
    await supabase.from('analysis_metrics').upsert({
      metric_date: today,
      brand: bs.brand,
      category: 'all',
      total_conversations: Number(bs.total),
      avg_quality_score: bs.avg_quality,
      avg_response_time_seconds: bs.avg_response_time_s != null ? Math.round(Number(bs.avg_response_time_s)) : null,
      sentiment_positive: bs.positive_count,
      sentiment_negative: bs.negative_count,
      sentiment_neutral: Number(bs.total) - (bs.positive_count ?? 0) - (bs.negative_count ?? 0),
    }, { onConflict: 'metric_date,brand,category' });
  }

  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      total_conversations_analyzed: totalConversations,
      total_knowledge_entries: totalKnowledge,
      avg_quality_score: Math.round(avgQuality * 10) / 10,
      avg_response_time_minutes: Math.round(avgResponse / 60),
      sentiments,
    },
    by_brand: brandSummary ?? [],
    by_category: categorySummary ?? [],
    top_questions: topQuestions ?? [],
    needs_attention: needsAttention ?? [],
  };

  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(reportsDir, `report-${timestamp}.json`);
  const txtPath = path.join(reportsDir, `report-${timestamp}.txt`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const topRows = (topQuestions ?? []) as TopQuestionRow[];
  const needsRows = (needsAttention ?? []) as NeedsAttentionRow[];

  const txt = `
RELATÓRIO DE ANÁLISE DE ATENDIMENTO
Gerado em: ${new Date().toLocaleString('pt-BR')}
${'═'.repeat(50)}

RESUMO GERAL
  Conversas analisadas : ${totalConversations}
  Entradas na base     : ${totalKnowledge}
  Qualidade média      : ${report.summary.avg_quality_score}/5
  Tempo médio resposta : ${report.summary.avg_response_time_minutes} min
  Sentimentos          : 😊 ${sentiments.positive} positivo | 😐 ${sentiments.neutral} neutro | 😞 ${sentiments.negative} negativo

${'─'.repeat(50)}
POR MARCA
${brandRows
  .map(b => `  ${b.brand.toUpperCase().padEnd(12)} | ${String(b.total).padStart(5)} conversas | qualidade: ${b.avg_quality} | resposta: ${Math.round(Number(b.avg_response_time_s ?? 0) / 60)}min`)
  .join('\n')}

${'─'.repeat(50)}
TOP 20 PERGUNTAS MAIS FREQUENTES
${topRows
  .map((q, i) => `  ${String(i + 1).padStart(2)}. [${q.brand}/${q.category}] (${q.frequency}x) ${q.question_pattern}`)
  .join('\n')}

${'─'.repeat(50)}
CONVERSAS QUE PRECISAM DE ATENÇÃO (qualidade ≤ 2 ou sentimento negativo)
${needsRows
  .slice(0, 20)
  .map(n => `  • ${n.contact_name ?? 'Sem nome'} | ${n.brand}/${n.category} | nota: ${n.quality_score ?? 'N/A'} | ${n.quality_notes}`)
  .join('\n')}
`.trim();

  fs.writeFileSync(txtPath, txt);

  console.log(`Relatório JSON : ${jsonPath}`);
  console.log(`Relatório TXT  : ${txtPath}`);
  console.log('\n' + txt);
  console.log('\nFASE 3 concluída.\n');
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  const reportOnly = process.argv[2] === 'report' || process.argv[2] === '--report-only';

  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!supabaseServiceKey) missing.push('SUPABASE_SERVICE_KEY ou SUPABASE_SERVICE_ROLE_KEY');
  if (!reportOnly && !process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  if (missing.length > 0) {
    console.error('Erro: variáveis de ambiente ausentes no .env (raiz do projeto ou apps/ia-atendimento):');
    missing.forEach((m) => console.error('  -', m));
    console.error('\nAdicione no .env da raiz do MonsterChat e rode de novo.');
    process.exit(1);
  }

  console.log('╔═══════════════════════════════════════╗');
  console.log('║   IA ATENDIMENTO — MONSTER / FAGENIUS  ║');
  console.log('╚═══════════════════════════════════════╝');

  if (reportOnly) {
    await runPhase3();
    console.log('\n✓ Relatório gerado. Arquivos em apps/ia-atendimento/reports/\n');
    return;
  }

  await runPhase1();
  await runPhase2();
  await runPhase3();

  console.log('\n✓ Todas as fases concluídas com sucesso!');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
