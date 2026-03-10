import { NextRequest, NextResponse } from 'next/server';
import { createMessage } from '@/lib/api/services/message';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

/**
 * Marca a conversa como "devolvida para a IA": insere uma mensagem system
 * para que a última outbound não seja mais do agente e a IA volte a responder.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const conversationId = body.conversationId ?? body.conversation_id;
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId é obrigatório' }, { status: 400 });
    }

    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .single();
    if (!conv) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
    }

    await createMessage({
      conversationId,
      direction: 'outbound',
      senderType: 'system',
      contentType: 'text',
      body: '[Conversa devolvida para a IA]',
      status: 'sent',
    });

    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API ia/return-to-bot]', err);
    return NextResponse.json({ error: 'Falha ao devolver para IA' }, { status: 500 });
  }
}
