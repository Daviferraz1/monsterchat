import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { verifyWebhookSignature, getRawBody } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware para verificar assinatura de webhook da Meta
 * Deve ser usado antes de processar webhooks do WhatsApp/Instagram
 */
export async function verifyWebhookSignatureMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    
    if (!signature) {
      logger.warn('Webhook signature missing', { path: req.path });
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Obter o body raw para verificação
    const rawBody = await getRawBody(req);
    
    // Verificar assinatura
    const isValid = verifyWebhookSignature(
      rawBody,
      signature,
      env.META_APP_SECRET
    );

    if (!isValid) {
      logger.warn('Invalid webhook signature', { path: req.path });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse do JSON após verificação
    req.body = JSON.parse(rawBody);
    next();
  } catch (error) {
    logger.error('Error verifying webhook signature', error);
    res.status(400).json({ error: 'Invalid request' });
  }
}
