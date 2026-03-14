import { NextRequest, NextResponse } from 'next/server';
import { isSuggestionEnabled, isSuggestionAIEnabled } from '@/lib/api/ia/autopilot';
import { getSuggestion } from '@/lib/api/ia/suggestion';
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

    if (conversationId) {
      if (!contactName) {
        const { data } = await supabaseAdmin
          .from('conversations')
          .select('contact:contacts(name)')
          .eq('id', conversationId)
          .single();
        const contact = (data as { contact?: { name?: string } } | null)?.contact;
        if (contact?.name?.trim()) contactName = contact.name.trim();
      }
      const { data: recentMessages } = await supabaseAdmin
        .from('messages')
        .select('body')
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .eq('content_type', 'text')
        .not('body', 'is', null)
        .neq('body', '')
        .order('created_at', { ascending: false })
        .limit(15);
      const bodies = (recentMessages ?? [])
        .map((m: { body: string }) => m.body?.trim())
        .filter(Boolean)
        .reverse();
      if (bodies.length > 0) {
        messageBody = bodies.join('\n');
      }
    }

    const suggestionAiEnabled = await isSuggestionAIEnabled();
    const result = await getSuggestion(
      messageBody,
      brand,
      contactName,
      suggestionAiEnabled
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
