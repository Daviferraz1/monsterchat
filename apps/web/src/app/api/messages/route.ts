import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { sendWhatsAppText } from '@/lib/api/services/whatsapp';
import { sendInstagramText } from '@/lib/api/services/instagram';
import { createMessage } from '@/lib/api/services/message';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversation_id, text, sender_id } = body;

    if (!conversation_id || !text) {
      return NextResponse.json(
        { error: 'conversation_id and text are required' },
        { status: 400 }
      );
    }

    // Buscar conversa e canal
    const { data: conversation, error: convError } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        channel:channels(*),
        contact:contacts(*)
      `)
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    const channel = conversation.channel;
    const contact = conversation.contact;

    if (!channel || !contact) {
      return NextResponse.json(
        { error: 'Channel or contact not found' },
        { status: 404 }
      );
    }

    let externalId: string | undefined;
    let status: 'pending' | 'sent' | 'failed' = 'pending';

    try {
      // Enviar mensagem via API apropriada
      if (channel.type === 'whatsapp') {
        const response = await sendWhatsAppText({
          phoneNumberId: channel.external_id,
          accessToken: channel.access_token,
          to: contact.external_id,
          text,
        });
        externalId = response.messages[0]?.id;
        status = 'sent';
      } else if (channel.type === 'instagram') {
        const response = await sendInstagramText({
          pageId: channel.external_id,
          accessToken: channel.access_token,
          recipientId: contact.external_id,
          text,
        });
        externalId = response.message_id;
        status = 'sent';
      } else {
        return NextResponse.json(
          { error: 'Unsupported channel type' },
          { status: 400 }
        );
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      status = 'failed';
    }

    // Criar mensagem no banco
    const message = await createMessage({
      conversationId: conversation_id,
      direction: 'outbound',
      senderType: 'agent',
      senderId: sender_id,
      contentType: 'text',
      body: text,
      externalId,
      status,
    });

    // Atualizar conversa
    await supabaseAdmin
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    return NextResponse.json(message);
  } catch (error: any) {
    console.error('Error in message send route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
