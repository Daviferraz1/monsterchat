import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Exige o segredo compartilhado (INTERNAL_API_SECRET) no header `x-internal-secret`.
 *
 * Protege as rotas internas (Baileys, conversas, mensagens, canais) que são chamadas
 * server-to-server pelo apps/web. Sem isso, qualquer um na internet com um channelId
 * poderia enviar mensagens, desconectar sessões, etc.
 *
 * Fail-closed: se INTERNAL_API_SECRET não estiver configurado, as rotas ficam bloqueadas
 * (503) em vez de abertas. Defina a MESMA variável no apps/api e no apps/web.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  const expected = env.INTERNAL_API_SECRET;
  if (!expected) {
    logger.error(
      'INTERNAL_API_SECRET não configurado — rotas internas bloqueadas por segurança. Defina a mesma variável no apps/api e no apps/web.'
    );
    return res.status(503).json({ error: 'Serviço não configurado (INTERNAL_API_SECRET ausente).' });
  }

  const provided = req.get('x-internal-secret') || '';
  if (!safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  return next();
}
