/**
 * IA respondendo direto ao aluno: gera resposta com Claude e envia via WhatsApp.
 * Chamado pelo webhook quando piloto está ativo e a última mensagem outbound não é do operador.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../supabase';
import { createMessage } from '../services/message';
import { updateConversation } from '../services/conversation';
import { sendWhatsAppText } from '../services/whatsapp';
import { getCatalogJSON } from './catalog';
import { buildSystemPrompt } from './system-prompt';
import { classifyIncomingMessage } from './classify';
import { apiEnv } from '../env';

const ESCALAR_REGEX = /\[ESCALAR:\s*(.+?)\]/s;
const WEB_QUERY_HINT_REGEX = /(edital|banca|inscri|cronograma|data da prova|gabarito|resultado|site oficial|concorr|vagas)/i;

export interface ReplyContext {
  conversationId: string;
  channelId: string;
  accessToken: string;
  contactPhone: string;
  contactName?: string | null;
  contactMetadata?: Record<string, unknown> | null;
  contactId: string;
  messageBody: string;
}

type WebSnippet = { title: string; url: string };

function shouldRunBroadWebSearch(messageBody: string, historyText: string): boolean {
  const haystack = `${messageBody}\n${historyText}`;
  return WEB_QUERY_HINT_REGEX.test(haystack);
}

async function fetchTextWithTimeout(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'MonsterChatBot/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function htmlToPlainText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function getBroadWebContext(query: string): Promise<string | null> {
  const q = query.trim().slice(0, 180);
  if (!q) return null;
  const html = await fetchTextWithTimeout(`https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`, 4500);
  if (!html) return null;

  const matches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const snippets: WebSnippet[] = [];
  for (const m of matches.slice(0, 5)) {
    const url = m[1] ?? '';
    const title = htmlToPlainText(m[2] ?? '');
    if (!url || !title) continue;
    snippets.push({ title, url });
  }
  if (snippets.length === 0) return null;
  return snippets.map((s, i) => `${i + 1}. ${s.title}\nFonte: ${s.url}`).join('\n\n');
}

/**
 * Verifica se a IA deve responder (não responde se o operador foi o último a enviar).
 */
export async function shouldIAReply(conversationId: string): Promise<boolean> {
  const { data: lastOutbound } = await supabaseAdmin
    .from('messages')
    .select('sender_type')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return lastOutbound?.sender_type !== 'agent';
}

/**
 * Classifica se for primeira mensagem ou reabertura (gap > 24h).
 */
async function ensureClassification(
  conversationId: string,
  messageBody: string,
  contactName?: string | null,
  contactMetadata?: Record<string, unknown> | null
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('conversation_analysis')
    .select('updated_at')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('last_message_at, status')
    .eq('id', conversationId)
    .single();

  const isReopened = conv?.status === 'closed';
  const gapMs = existing?.updated_at && conv?.last_message_at
    ? new Date(conv.last_message_at).getTime() - new Date(existing.updated_at).getTime()
    : Infinity;
  const isLongGap = gapMs > 24 * 60 * 60 * 1000;
  const shouldClassify = !existing || isReopened || isLongGap;

  if (shouldClassify) {
    await classifyIncomingMessage(
      conversationId,
      messageBody,
      contactName ?? undefined,
      contactMetadata ?? undefined
    );
  }
}

/**
 * Responde ao aluno com IA: monta prompt, chama Claude, envia WhatsApp e salva mensagem.
 * Se a resposta contiver [ESCALAR: ...], atualiza status para aguardando_interno e cria nota interna.
 */
export async function handleIAReply(ctx: ReplyContext): Promise<void> {
  console.log('[IA reply] Iniciando', { conversationId: ctx.conversationId });
  if (!apiEnv.ANTHROPIC_API_KEY) {
    console.warn('[IA reply] ANTHROPIC_API_KEY não configurada — configure no .env');
    return;
  }

  const ok = await shouldIAReply(ctx.conversationId);
  if (!ok) {
    console.log('[IA reply] Operador assumiu a conversa (última mensagem outbound foi do agente) — IA não responde');
    return;
  }

  await ensureClassification(
    ctx.conversationId,
    ctx.messageBody,
    ctx.contactName,
    ctx.contactMetadata
  );

  const { data: analysis } = await supabaseAdmin
    .from('conversation_analysis')
    .select('brand, category, intent, sentiment, urgency')
    .eq('conversation_id', ctx.conversationId)
    .maybeSingle();

  let salesRows: { product_names: string; status: string | null; sold_at: string; payment_method: string | null; payment_total: number | null }[] | null = null;
  const { data: byContactId } = await supabaseAdmin
    .from('guru_sales')
    .select('product_names, status, sold_at, payment_method, payment_total')
    .eq('contact_id', ctx.contactId)
    .order('sold_at', { ascending: false })
    .limit(3);
  if (byContactId?.length) {
    salesRows = byContactId;
  } else if (ctx.contactPhone) {
    const { data: byPhone } = await supabaseAdmin
      .from('guru_sales')
      .select('product_names, status, sold_at, payment_method, payment_total')
      .ilike('contact_phone', `%${ctx.contactPhone.replace(/\D/g, '').slice(-8)}%`)
      .order('sold_at', { ascending: false })
      .limit(3);
    salesRows = byPhone;
  }

  const { data: historyRows } = await supabaseAdmin
    .from('messages')
    .select('direction, sender_type, body, content_type, created_at')
    .eq('conversation_id', ctx.conversationId)
    .eq('content_type', 'text')
    .not('body', 'is', null)
    .neq('body', '')
    .order('created_at', { ascending: true })
    .limit(20);

  const historyText = (historyRows ?? [])
    .map((m: { direction: string; body: string }) =>
      m.direction === 'inbound' ? `ALUNO: ${m.body}` : `ASSISTENTE: ${m.body}`
    )
    .join('\n');

  const webContext = shouldRunBroadWebSearch(ctx.messageBody, historyText)
    ? await getBroadWebContext(`${ctx.messageBody}\n${historyText}`.slice(0, 400))
    : null;

  const catalogJSON = await getCatalogJSON();
  const contactMeta = ctx.contactMetadata as any;
  const systemPrompt = await buildSystemPrompt(
    catalogJSON,
    contactMeta,
    salesRows ?? []
  );

  const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `HISTÓRICO:\n${historyText || '(sem histórico)'}\n\nNOVA MENSAGEM DO ALUNO:\n${ctx.messageBody}${
          webContext ? `\n\nPESQUISA WEB (contexto auxiliar, priorize fontes oficiais):\n${webContext}` : ''
        }`,
      },
    ],
  });

  const rawReply =
    response.content[0].type === 'text' ? response.content[0].text : '';
  const escalarMatch = rawReply.match(ESCALAR_REGEX);
  const cleanReply = escalarMatch
    ? rawReply.replace(ESCALAR_REGEX, '').trim()
    : rawReply.trim();
  const motivoEscalar = escalarMatch?.[1]?.trim() ?? '';

  const { data: channel } = await supabaseAdmin
    .from('channels')
    .select('external_id')
    .eq('id', ctx.channelId)
    .single();

  const phoneNumberId = channel?.external_id;
  if (!phoneNumberId) {
    console.error('[IA reply] Canal sem external_id (Phone Number ID)');
    return;
  }

  // Quando escalar internamente, NÃO responder ao aluno.
  if (!escalarMatch && cleanReply) {
    try {
      await sendWhatsAppText({
        phoneNumberId,
        accessToken: ctx.accessToken,
        to: ctx.contactPhone,
        text: cleanReply,
      });
      console.log('[IA reply] Resposta enviada ao WhatsApp', { conversationId: ctx.conversationId });
    } catch (err) {
      console.error('[IA reply] Erro ao enviar WhatsApp:', err);
      return;
    }
  }

  if (!escalarMatch && cleanReply) {
    await createMessage({
      conversationId: ctx.conversationId,
      direction: 'outbound',
      senderType: 'system',
      contentType: 'text',
      body: cleanReply || undefined,
      status: 'sent',
    });
  }

  const now = new Date().toISOString();

  if (escalarMatch && motivoEscalar) {
    await updateConversation(ctx.conversationId, {
      status: 'aguardando_interno',
      lastMessageAt: now,
      lastMessagePreview: '[IA escalou internamente]',
    });

    const noteBody = `🤖 IA ESCALOU: ${motivoEscalar}\n\nContexto: ${analysis?.intent ?? ''}\nCategoria: ${analysis?.category ?? ''}\nMarca: ${analysis?.brand ?? ''}`;
    await supabaseAdmin.from('internal_notes').insert({
      conversation_id: ctx.conversationId,
      author_id: null,
      body: noteBody,
    });

    console.log('[IA reply] Escalado para humano:', { conversationId: ctx.conversationId, motivo: motivoEscalar });
  } else {
    await updateConversation(ctx.conversationId, {
      lastMessageAt: now,
      lastMessagePreview: cleanReply?.slice(0, 100) || '',
      lastAgentReplyAt: now,
    });
  }
}
