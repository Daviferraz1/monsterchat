import { NextRequest, NextResponse } from 'next/server';
import { isSuggestionEnabled, isSuggestionAIEnabled } from '@/lib/api/ia/autopilot';
import { getSuggestion, type SuggestionAgentContext } from '@/lib/api/ia/suggestion';
import { refreshConversationMemory, buildMemoryBlock } from '@/lib/api/ia/conversation-memory';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

/**
 * Sugestão de resposta com base na base de conhecimento e no catálogo de produtos.
 *
 * Análise contextual (quando conversationId é enviado):
 * - Busca as últimas 15 mensagens do lead na conversa e concatena em um único texto.
 * - Esse contexto é usado para: (1) match com produtos (nome, concurso, cargo);
 *   (2) busca na base de conhecimento (similaridade de texto).
 * - Assim, "Guarda municipal" (mensagem anterior) + "De barão de cocais" (última)
 *   são analisados juntos e o produto correto é identificado.
 * - Também busca o nome do contato para personalizar "Oi, [nome]!".
 *
 * Sem conversationId: usa apenas a última mensagem (messageBody) enviada pelo frontend.
 */
export async function POST(request: NextRequest) {
  try {
    const enabled = await isSuggestionEnabled();
    if (!enabled) {
      return NextResponse.json({
        confidence: 'none',
        suggestion: null,
        category: null,
        alternatives: [],
      });
    }
    const body = await request.json().catch(() => ({}));
    let messageBody = typeof body.messageBody === 'string' ? body.messageBody.trim() : '';
    const brand = typeof body.brand === 'string' ? body.brand : undefined;
    let contactName = typeof body.contactName === 'string' ? body.contactName.trim() || undefined : undefined;
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : undefined;

    // Saudação conforme o horário atual (fuso de São Paulo), independente do fuso do servidor.
    const now = new Date();
    const spTime = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    const spHour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(now)
    );
    const sauda = spHour < 12 ? 'bom dia' : spHour < 18 ? 'boa tarde' : 'boa noite';
    const nowHint = `Horário atual (São Paulo): ${spTime}. Se for cumprimentar, a saudação correta agora é "${sauda}".`;

    let agentCtx: SuggestionAgentContext = { nowHint };

    if (conversationId) {
      agentCtx.conversationId = conversationId;
      const { data } = await supabaseAdmin
        .from('conversations')
        .select('contact:contacts(id, name, phone, metadata)')
        .eq('id', conversationId)
        .single();
      const contact = (
        data as {
          contact?: { id?: string; name?: string; phone?: string; metadata?: Record<string, unknown> };
        } | null
      )?.contact;
      if (contact) {
        agentCtx.contactId = contact.id;
        agentCtx.contactPhone = contact.phone ?? undefined;
        if (!contactName && contact.name?.trim()) contactName = contact.name.trim();
        const dados = contact.metadata?.dados as Record<string, unknown> | undefined;
        if (dados && typeof dados === 'object') {
          const lines = Object.entries(dados)
            .filter(([, v]) => v != null && String(v).trim() !== '')
            .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
          if (lines.length) agentCtx.contactDataBlock = lines.join(' | ');
        }
      }

      // Conversa completa (aluno + atendente) para a IA entender o que já foi respondido.
      const { data: convMsgs } = await supabaseAdmin
        .from('messages')
        .select('direction, body')
        .eq('conversation_id', conversationId)
        .eq('content_type', 'text')
        .not('body', 'is', null)
        .neq('body', '')
        .order('created_at', { ascending: false })
        .limit(20);
      const ordered = ((convMsgs ?? []) as Array<{ direction: string; body: string }>).reverse();
      if (ordered.length > 0) {
        agentCtx.transcript = ordered
          .map((m) => `${m.direction === 'inbound' ? 'ALUNO' : 'ATENDENTE'}: ${m.body.trim()}`)
          .join('\n');
        const inbound = ordered
          .filter((m) => m.direction === 'inbound')
          .map((m) => m.body.trim())
          .filter(Boolean);
        if (inbound.length > 0) messageBody = inbound.join('\n');
      }

      // Memória da conversa (resumo + ficha) — para conversas longas não perderem o contexto antigo.
      if (agentCtx.transcript) {
        const { count: msgCount } = await supabaseAdmin
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .eq('content_type', 'text')
          .not('body', 'is', null)
          .neq('body', '');
        const mem = await refreshConversationMemory({
          conversationId,
          transcript: agentCtx.transcript,
          totalCount: msgCount ?? 0,
        });
        const block = buildMemoryBlock(mem);
        if (block) agentCtx.memoryBlock = block;
      }

      // Imagens recentes do aluno (print de questão, comprovante, tela) para a IA analisar
      const { data: imgRows } = await supabaseAdmin
        .from('messages')
        .select('media_url, media_mime_type')
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .eq('content_type', 'image')
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(2);
      const images = (imgRows ?? [])
        .map((m: { media_url: string | null; media_mime_type: string | null }) => ({
          url: m.media_url as string,
          mime: m.media_mime_type,
        }))
        .filter((i) => i.url)
        .reverse();
      if (images.length > 0) {
        agentCtx.images = images;
      }
    }

    const suggestionAiEnabled = await isSuggestionAIEnabled();
    const result = await getSuggestion(
      messageBody,
      brand,
      contactName,
      suggestionAiEnabled,
      agentCtx
    );
    return NextResponse.json({
      confidence: result.confidence,
      suggestion: result.suggestion,
      category: result.category,
      alternatives: result.alternatives ?? [],
    });
  } catch (err) {
    console.error('[API ia/suggestion]', err);
    return NextResponse.json({
      confidence: 'none',
      suggestion: null,
      category: null,
      alternatives: [],
    });
  }
}
