import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middlewares/error.middleware.js';

// Routes
import webhookRoutes from './routes/webhook.routes.js';
import conversationRoutes from './routes/conversation.routes.js';
import messageRoutes from './routes/message.routes.js';
import channelRoutes from './routes/channel.routes.js';
import baileysRoutes from './routes/baileys.routes.js';
import whatsappRoutes from './routes/whatsapp.routes.js';
import { requireInternalSecret } from './middlewares/internal-auth.middleware.js';

const app = express();

// CORS: aceita FRONTEND_URL única ou várias origens separadas por vírgula (ex.: domínio custom + Vercel)
const allowedOrigins = env.FRONTEND_URL
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
if (allowedOrigins.length === 0) {
  logger.warn('FRONTEND_URL não definida: CORS vai rejeitar requisições do navegador. Defina no Railway (ex.: https://chatmonster.monsterconcursos.com.br)');
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhooks da Meta: abertos (verificação por assinatura no próprio handler).
app.use('/webhooks', webhookRoutes);

// Rotas internas: só o apps/web (com o segredo compartilhado) pode chamar.
app.use('/api/conversations', requireInternalSecret, conversationRoutes);
app.use('/api/messages', requireInternalSecret, messageRoutes);
app.use('/api/channels', requireInternalSecret, channelRoutes);
app.use('/baileys', requireInternalSecret, baileysRoutes);
app.use('/whatsapp', requireInternalSecret, whatsappRoutes);

// Error handler
app.use(errorHandler);

// Start server
const PORT = env.PORT;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, {
    port: PORT,
    env: env.NODE_ENV,
  });
});
