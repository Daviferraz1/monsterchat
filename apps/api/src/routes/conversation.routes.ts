import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /conversations
 * Lista conversas com filtros opcionais
 */
router.get('/', async (req, res) => {
  try {
    const { status, assigned_to, channel_id } = req.query;

    let query = supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts(*),
        channel:channels(*),
        last_message:messages(*)
      `)
      .order('last_message_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (assigned_to) {
      query = query.eq('assigned_to', assigned_to);
    }
    if (channel_id) {
      query = query.eq('channel_id', channel_id);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching conversations', error);
      return res.status(500).json({ error: 'Failed to fetch conversations' });
    }

    return res.json(data);
  } catch (error) {
    logger.error('Error in conversations route', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /conversations/:id
 * Obtém uma conversa específica
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts(*),
        channel:channels(*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      logger.error('Error fetching conversation', error);
      return res.status(500).json({ error: 'Failed to fetch conversation' });
    }

    return res.json(data);
  } catch (error) {
    logger.error('Error in conversation route', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /conversations/:id
 * Atualiza uma conversa (status, assigned_to, etc.)
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('conversations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating conversation', error);
      return res.status(500).json({ error: 'Failed to update conversation' });
    }

    return res.json(data);
  } catch (error) {
    logger.error('Error in conversation update route', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
