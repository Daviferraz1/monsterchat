import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { createMessage } from '../services/message.service.js';
import { sendWhatsAppText } from '../services/whatsapp.service.js';
import { sendInstagramText } from '../services/instagram.service.js';
import { getChannelByExternalId } from '../services/channel.service.js';

const router = Router();

/**
 * GET /messages?conversation_id=xxx
 * Lista mensagens de uma conversa
 */
router.get('/', async (req, res) => {
  try {
    const { conversation_id } = req.query;

    if (!conversation_id) {
      return res.status(400).json({ error: 'conversation_id is required' });
    }

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Error fetching messages', error);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }

    res.json(data);
  } catch (error) {
    logger.error('Error in messages route', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /messages
 * Envia uma nova mensagem
 */
router.post('/', async (req, res) => {
  try {
    const { conversation_id, text, sender_id } = req.body;

    if (!conversation_id || !text) {
      return res.status(400).json({ error: 'conversation_id and text are required' });
    }

    // Buscar conversa e canal
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        channel:channels(*),
        contact:contacts(*)
      `)
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const channel = conversation.channel;
    const contact = conversation.contact;

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
        return res.status(400).json({ error: 'Unsupported channel type' });
      }
    } catch (error: any) {
      logger.error('Error sending message', error);
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
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    res.json(message);
  } catch (error) {
    logger.error('Error in message send route', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
