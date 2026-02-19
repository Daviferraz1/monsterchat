import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Endpoint GET para verificação de webhook da Meta
 * Usado tanto para WhatsApp quanto Instagram
 */
export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.META_WEBHOOK_VERIFY_TOKEN) {
    logger.info('Webhook verified', {
      mode,
      challenge,
    });
    res.status(200).send(challenge);
  } else {
    logger.warn('Webhook verification failed', {
      mode,
      tokenProvided: !!token,
    });
    res.sendStatus(403);
  }
}
