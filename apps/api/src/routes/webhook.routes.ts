import { Router } from 'express';
import { verifyWebhookSignatureMiddleware } from '../middlewares/webhook-signature.middleware.js';
import { verifyWebhook } from '../webhooks/verify.webhook.js';
import { handleWhatsAppWebhook } from '../webhooks/whatsapp.webhook.js';
import { handleInstagramWebhook } from '../webhooks/instagram.webhook.js';

const router = Router();

// GET para verificação (sem assinatura)
router.get('/whatsapp', verifyWebhook);
router.get('/instagram', verifyWebhook);

// POST para receber webhooks (com verificação de assinatura)
router.post('/whatsapp', verifyWebhookSignatureMiddleware, handleWhatsAppWebhook);
router.post('/instagram', verifyWebhookSignatureMiddleware, handleInstagramWebhook);

export default router;
