// Variáveis de ambiente para API Routes (Serverless Functions)
// Durante o build do Next.js, essas variáveis podem não estar disponíveis
// Usamos valores padrão para permitir que o build complete
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || !process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

/** True se as credenciais do Supabase são placeholder (não configuradas). */
export function isSupabasePlaceholder(): boolean {
  const isPlaceholder = (
    SUPABASE_URL === 'https://placeholder.supabase.co' ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    SUPABASE_SERVICE_ROLE_KEY === 'placeholder-service-role-key'
  );
  
  // Debug apenas em desenvolvimento
  if (process.env.NODE_ENV === 'development' && isPlaceholder) {
    console.warn('[Supabase] Usando valores placeholder:', {
      SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
      serviceKeyIsPlaceholder: SUPABASE_SERVICE_ROLE_KEY === 'placeholder-service-role-key',
      serviceKeyLength: SUPABASE_SERVICE_ROLE_KEY?.length,
      env_NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      env_SUPABASE_SERVICE_ROLE_KEY_exists: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      env_SUPABASE_SERVICE_ROLE_KEY_length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE')),
    });
  }
  
  return isPlaceholder;
}

export const apiEnv = {
  // Supabase
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  
  // Meta App
  META_APP_SECRET: process.env.META_APP_SECRET || 'placeholder-meta-secret',
  META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN || 'placeholder-verify-token',
  
  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID,
  
  // Instagram (se for um app diferente do WhatsApp, use INSTAGRAM_APP_SECRET = Chave secreta do app do Instagram)
  INSTAGRAM_APP_SECRET: process.env.INSTAGRAM_APP_SECRET,
  INSTAGRAM_PAGE_ID: process.env.INSTAGRAM_PAGE_ID,
  INSTAGRAM_PAGE_ACCESS_TOKEN: process.env.INSTAGRAM_PAGE_ACCESS_TOKEN,
  INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,

  // Digital Manager Guru – webhook de transações (Account Token para validar api_token)
  DIGITAL_GURU_ACCOUNT_TOKEN: process.env.DIGITAL_GURU_ACCOUNT_TOKEN,
  // Opcional: para buscar vendas na Guru (User Token + URL base da API)
  DIGITAL_GURU_USER_TOKEN: process.env.DIGITAL_GURU_USER_TOKEN,
  DIGITAL_GURU_API_BASE_URL: process.env.DIGITAL_GURU_API_BASE_URL,

  // Facebook Pixel + Conversions API (rastreamento de campanhas)
  NEXT_PUBLIC_FB_PIXEL_ID: process.env.NEXT_PUBLIC_FB_PIXEL_ID,
  FB_CAPI_ACCESS_TOKEN: process.env.FB_CAPI_ACCESS_TOKEN,

  // API do MonsterChat (Express) – usada para WhatsApp Baileys (QR) e envio
  API_URL: process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3001',

  // IA Atendimento (classificação + sugestões)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,

  // Embeddings da base de conhecimento (busca semântica) — Google Gemini
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Plataforma de alunos (Monster Questões + Study) — 2º Supabase (diagnóstico/liberação de acesso)
  PLATFORM_SUPABASE_URL: process.env.PLATFORM_SUPABASE_URL,
  PLATFORM_SUPABASE_SERVICE_KEY: process.env.PLATFORM_SUPABASE_SERVICE_KEY,

  // Resend – e-mails de login/senha (Monster Study, Monster Questões, Monster Sound)
  RESEND_API_KEY: process.env.RESEND_API_KEY,
} as const;
