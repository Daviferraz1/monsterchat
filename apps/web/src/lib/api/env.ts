// Variáveis de ambiente para API Routes (Serverless Functions)
// Durante o build do Next.js, essas variáveis podem não estar disponíveis
// Usamos valores padrão para permitir que o build complete
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || !process.env.NEXT_PUBLIC_SUPABASE_URL;

export const apiEnv = {
  // Supabase
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key',
  
  // Meta App
  META_APP_SECRET: process.env.META_APP_SECRET || 'placeholder-meta-secret',
  META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN || 'placeholder-verify-token',
  
  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID,
  
  // Instagram
  INSTAGRAM_PAGE_ID: process.env.INSTAGRAM_PAGE_ID,
  INSTAGRAM_PAGE_ACCESS_TOKEN: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN,
  INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
} as const;
