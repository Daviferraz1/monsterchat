/**
 * Fase 3 (enxuta): memória de conversa — resumo rolante + slots básicos.
 * Guardados em conversation_analysis (summary, slots, summary_message_count).
 * Atualizado com Haiku (barato) e só quando a conversa cresceu o suficiente,
 * para conversas longas não perderem contexto sem gastar a cada preview.
 */
import Anthropic from '@anthropic-ai/sdk';
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';

export interface ConversationMemory {
  summary: string | null;
  slots: Record<string, unknown>;
  summaryMessageCount: number;
}

const REFRESH_THRESHOLD = 6; // só re-resume quando há ≥ N mensagens novas desde o último resumo

function parseJsonSafe<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/\n?```$/m, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : cleaned) as T;
  } catch {
    return null;
  }
}

export async function getConversationMemory(conversationId: string): Promise<ConversationMemory> {
  const { data } = await supabaseAdmin
    .from('conversation_analysis')
    .select('summary, slots, summary_message_count')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  return {
    summary: (data?.summary as string) ?? null,
    slots: (data?.slots as Record<string, unknown>) ?? {},
    summaryMessageCount: (data?.summary_message_count as number) ?? 0,
  };
}

/**
 * Atualiza resumo + slots se a conversa cresceu o suficiente; senão devolve a memória atual.
 */
export async function refreshConversationMemory(params: {
  conversationId: string;
  transcript: string;
  totalCount: number;
}): Promise<ConversationMemory> {
  const current = await getConversationMemory(params.conversationId);

  const grew = params.totalCount - current.summaryMessageCount;
  const shouldRefresh =
    !!apiEnv.ANTHROPIC_API_KEY &&
    !!params.transcript.trim() &&
    ((current.summary && grew >= REFRESH_THRESHOLD) || (!current.summary && params.totalCount >= REFRESH_THRESHOLD));

  if (!shouldRefresh) return current;

  try {
    const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
    const system = `Você mantém a MEMÓRIA de um atendimento (Monster Concursos / FAGENIUS). A partir do resumo anterior e das mensagens recentes, devolva APENAS um JSON com:
- "summary": resumo curto (máx ~120 palavras) do que importa — quem é o aluno, o que quer, o que já foi respondido/combinado, pendências.
- "slots": objeto com os campos que você souber (omita os que não souber): "nome", "interesse" (curso/concurso), "email", "status" ("lead" | "aluno" | "aguardando_pagamento" | "suporte" | "outro"), "pendencias" (array de frases curtas).
Mantenha o que já era verdade; atualize com o que há de novo. NÃO invente. Sem markdown, só o JSON.`;
    const userContent = `RESUMO ANTERIOR:\n${current.summary || '(nenhum)'}\n\nSLOTS ANTERIORES:\n${JSON.stringify(current.slots || {})}\n\nMENSAGENS RECENTES:\n${params.transcript}`;

    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userContent }],
    });

    const raw = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const parsed = parseJsonSafe<{ summary?: string; slots?: Record<string, unknown> }>(raw);
    if (!parsed) return current;

    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 2000) : current.summary;
    const slots = parsed.slots && typeof parsed.slots === 'object' ? parsed.slots : current.slots;

    await supabaseAdmin.from('conversation_analysis').upsert(
      {
        conversation_id: params.conversationId,
        summary,
        slots,
        summary_message_count: params.totalCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'conversation_id' }
    );

    return { summary, slots, summaryMessageCount: params.totalCount };
  } catch (err) {
    console.error('[IA conversation-memory]', err);
    return current;
  }
}

/** Monta o bloco compacto de memória para o prompt do agente. */
export function buildMemoryBlock(mem: ConversationMemory): string | null {
  const parts: string[] = [];
  if (mem.summary?.trim()) parts.push(`Resumo: ${mem.summary.trim()}`);

  const s = (mem.slots || {}) as Record<string, unknown>;
  const slotLines: string[] = [];
  if (s.nome) slotLines.push(`nome: ${s.nome}`);
  if (s.interesse) slotLines.push(`interesse: ${s.interesse}`);
  if (s.email) slotLines.push(`e-mail: ${s.email}`);
  if (s.status) slotLines.push(`status: ${s.status}`);
  if (Array.isArray(s.pendencias) && s.pendencias.length) {
    slotLines.push(`pendências: ${(s.pendencias as unknown[]).join('; ')}`);
  }
  if (slotLines.length) parts.push(`Ficha: ${slotLines.join(' | ')}`);

  return parts.length ? parts.join('\n') : null;
}
