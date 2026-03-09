import { Router, Request, Response } from 'express';
import { getChannelById } from '../services/channel.service.js';
import {
  connectChannel,
  getStatus,
  sendText,
  sendMedia,
  disconnectChannel,
} from '../services/baileys.manager.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * GET /baileys/qr/:channelId
 * Retorna o QR code atual (base64 ou string) para o canal.
 * Se já conectado, retorna { connected: true }.
 */
router.get('/qr/:channelId', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const channel = await getChannelById(channelId);
    if (!channel || channel.type !== 'whatsapp_baileys') {
      return res.status(404).json({ error: 'Canal não encontrado ou não é do tipo WhatsApp Baileys.' });
    }

    const status = getStatus(channelId);
    if (status.connected) {
      return res.json({ connected: true, qr: null });
    }

    const { qr, connected } = await connectChannel(channelId);
    if (connected) {
      return res.json({ connected: true, qr: null });
    }

    return res.json({ connected: false, qr: qr || null });
  } catch (error) {
    logger.error('Baileys GET qr error', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao obter QR code.',
    });
  }
});

/**
 * GET /baileys/status/:channelId
 * Retorna o status da conexão Baileys do canal.
 */
router.get('/status/:channelId', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const channel = await getChannelById(channelId);
    if (!channel || channel.type !== 'whatsapp_baileys') {
      return res.status(404).json({ error: 'Canal não encontrado ou não é do tipo WhatsApp Baileys.' });
    }

    const status = getStatus(channelId);
    return res.json({ connected: status.connected, hasSocket: status.hasSocket });
  } catch (error) {
    logger.error('Baileys GET status error', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao obter status.',
    });
  }
});

/**
 * POST /baileys/send
 * Envia mensagem (texto ou mídia) via Baileys.
 * Body: { channelId, to (número ou jid), text?, mediaUrl?, contentType? }
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { channelId, to, text, mediaUrl, contentType, caption, filename } = req.body;

    if (!channelId || !to) {
      return res.status(400).json({ error: 'channelId e to são obrigatórios.' });
    }

    const channel = await getChannelById(channelId);
    if (!channel || channel.type !== 'whatsapp_baileys') {
      return res.status(404).json({ error: 'Canal não encontrado ou não é do tipo WhatsApp Baileys.' });
    }

    const hasMedia =
      mediaUrl &&
      contentType &&
      ['image', 'video', 'audio', 'document'].includes(contentType);

    if (hasMedia) {
      const result = await sendMedia(channelId, to, {
        mediaUrl,
        contentType,
        caption: caption || text,
        filename,
      });
      return res.json(result);
    }

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Envie text ou mediaUrl + contentType.' });
    }

    const result = await sendText(channelId, to, text);
    return res.json(result);
  } catch (error) {
    logger.error('Baileys POST send error', error);
    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.';
    const status = message.includes('not connected') ? 503 : 500;
    return res.status(status).json({ error: message });
  }
});

/**
 * POST /baileys/disconnect/:channelId
 * Desconecta a sessão Baileys do canal (útil para trocar de número).
 */
router.post('/disconnect/:channelId', async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const channel = await getChannelById(channelId);
    if (!channel || channel.type !== 'whatsapp_baileys') {
      return res.status(404).json({ error: 'Canal não encontrado ou não é do tipo WhatsApp Baileys.' });
    }

    disconnectChannel(channelId);
    return res.json({ ok: true, message: 'Desconectado.' });
  } catch (error) {
    logger.error('Baileys POST disconnect error', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Erro ao desconectar.',
    });
  }
});

export default router;
