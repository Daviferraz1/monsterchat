import { Router, Request, Response } from 'express';
import { getChannelById } from '../services/channel.service.js';
import { sendWhatsAppMedia, sendWhatsAppText } from '../services/whatsapp.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /whatsapp/send
 *
 * Envio avulso pela Cloud API, sem passar por conversa — o espelho do
 * `/baileys/send` para canais do tipo `whatsapp`. O `POST /api/messages` não
 * serve para isto: ele exige `conversation_id` (logo, um contato que já
 * escreveu) e só manda texto, enquanto o `sendWhatsAppMedia` do serviço nunca
 * teve rota que o alcançasse.
 *
 * Quem usa: automações que precisam disparar para um número conhecido — o
 * monitor de concursos manda por aqui a arte das notícias de segurança
 * pública.
 *
 * Body: { channelId, to, text?, mediaUrl?, contentType?, caption?, filename? }
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    const { channelId, to, text, mediaUrl, contentType, caption, filename } = req.body;

    if (!channelId || !to) {
      return res.status(400).json({ error: 'channelId e to são obrigatórios.' });
    }

    const channel = await getChannelById(channelId);
    if (!channel || channel.type !== 'whatsapp') {
      return res
        .status(404)
        .json({ error: 'Canal não encontrado ou não é do tipo WhatsApp Cloud API.' });
    }

    const hasMedia =
      mediaUrl && contentType && ['image', 'video', 'audio', 'document'].includes(contentType);

    const result = hasMedia
      ? await sendWhatsAppMedia({
          phoneNumberId: channel.external_id,
          accessToken: channel.access_token,
          to,
          mediaType: contentType,
          mediaUrl,
          caption: caption || text,
          filename,
        })
      : await (async () => {
          if (!text || typeof text !== 'string') {
            throw new Error('Envie text ou mediaUrl + contentType.');
          }
          return sendWhatsAppText({
            phoneNumberId: channel.external_id,
            accessToken: channel.access_token,
            to,
            text,
          });
        })();

    return res.json(result);
  } catch (error: any) {
    logger.error('WhatsApp POST send error', error);

    // A Meta devolve o motivo real dentro de `response.data.error`; sem
    // repassá-lo, todo problema virava "500 erro ao enviar" e a automação não
    // tinha como distinguir janela fechada de token vencido.
    const meta = error?.response?.data?.error;
    if (meta) {
      const janelaFechada = meta.code === 131047 || meta.code === 131026;
      return res.status(janelaFechada ? 409 : 502).json({
        error: meta.message,
        code: meta.code,
        details: meta.error_data?.details,
        hint: janelaFechada
          ? 'Fora da janela de 24h: a Cloud API só aceita mensagem livre até 24h ' +
            'depois da última mensagem RECEBIDA desse número. Peça para o destinatário ' +
            'mandar qualquer mensagem, ou use um template aprovado.'
          : undefined,
      });
    }

    const message = error instanceof Error ? error.message : 'Erro ao enviar mensagem.';
    return res.status(500).json({ error: message });
  }
});

export default router;
