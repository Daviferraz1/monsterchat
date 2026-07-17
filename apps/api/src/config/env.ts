import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Carrega .env do diretório atual (apps/api) e, se necessário, da raiz do monorepo
dotenv.config();
if (!process.env.SUPABASE_URL) {
  const rootEnv = path.join(process.cwd(), '..', '..', '.env');
  if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
}

export const env = {
  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,

  // Meta App (obrigatórios só se usar webhooks WhatsApp/Instagram na API)
  META_APP_SECRET: process.env.META_APP_SECRET || '',
  META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
  
  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID,
  
  // Instagram
  INSTAGRAM_PAGE_ID: process.env.INSTAGRAM_PAGE_ID,
  INSTAGRAM_PAGE_ACCESS_TOKEN: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN,
  INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
  
  // App
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  API_URL: process.env.API_URL || 'http://localhost:3001',

  // Segredo compartilhado que autentica as chamadas internas vindas do apps/web
  // (header x-internal-secret). Defina a MESMA string aqui e no apps/web.
  INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET || '',
} as const;

// Validar variáveis obrigatórias (Meta opcional se só usar Baileys)
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

for (const varName of requiredEnvVars) {
  if (!env[varName as keyof typeof env]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
