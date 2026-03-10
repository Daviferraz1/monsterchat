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
        content: `HISTÓRICO:\n${historyText || '(sem histórico)'}\n\nNOVA MENSAGEM DO ALUNO:\n${ctx.messageBody}`,
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

  if (cleanReply) {
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

  await createMessage({
    conversationId: ctx.conversationId,
    direction: 'outbound',
    senderType: 'system',
    contentType: 'text',
    body: cleanReply || null,
    status: 'sent',
  });

  const now = new Date().toISOString();

  if (escalarMatch && motivoEscalar) {
    await updateConversation(ctx.conversationId, {
      status: 'aguardando_interno',
      lastMessageAt: now,
      lastMessagePreview: cleanReply?.slice(0, 100) || '[IA escalou]',
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
