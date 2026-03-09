import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /channels
 * Lista todos os canais
 */
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error fetching channels', error);
      return res.status(500).json({ error: 'Failed to fetch channels' });
    }

    return res.json(data);
  } catch (error) {
    logger.error('Error in channels route', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /channels
 * Cria um novo canal
 */
router.post('/', async (req, res) => {
  try {
    const { type, name, external_id, business_account_id, access_token, webhook_verify_token, metadata } = req.body;

    if (!type || !name) {
      return res.status(400).json({ error: 'Missing required fields: type, name' });
    }

    const isBaileys = type === 'whatsapp_baileys';
    const externalId = external_id || (isBaileys ? 'baileys' : null);
    const accessToken = access_token || (isBaileys ? 'baileys-placeholder' : null);

    if (!isBaileys && (!externalId || !accessToken)) {
      return res.status(400).json({ error: 'Para canais que não são WhatsApp Baileys, external_id e access_token são obrigatórios.' });
    }

    const { data, error } = await supabase
      .from('channels')
      .insert({
        type,
        name,
        external_id: externalId,
        business_account_id: business_account_id || null,
        access_token: accessToken,
        webhook_verify_token: webhook_verify_token || null,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating channel', error);
      return res.status(500).json({ error: 'Failed to create channel' });
    }

    return res.json(data);
  } catch (error) {
    logger.error('Error in channel create route', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /channels/:id
 * Atualiza um canal
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('channels')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Error updating channel', error);
      return res.status(500).json({ error: 'Failed to update channel' });
    }

    return res.json(data);
  } catch (error) {
    logger.error('Error in channel update route', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
