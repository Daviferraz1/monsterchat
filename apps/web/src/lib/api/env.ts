// Variáveis de ambiente para API Routes (Serverless Functions)
export const apiEnv = {
  // Supabase
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
} as const;

// Validar variáveis obrigatórias
const requiredEnvVars = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.warn(`Missing required environment variable: ${varName}`);
  }
}
