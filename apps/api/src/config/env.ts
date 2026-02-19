import dotenv from 'dotenv';

dotenv.config();

export const env = {
  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  
  // Meta App
  META_APP_SECRET: process.env.META_APP_SECRET!,
  META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN!,
  
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
} as const;

// Validar variáveis obrigatórias
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
];

for (const varName of requiredEnvVars) {
  if (!env[varName as keyof typeof env]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
}
