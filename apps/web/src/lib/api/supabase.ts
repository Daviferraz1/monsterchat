import { createClient } from '@supabase/supabase-js';
import { apiEnv } from './env';

// Criar cliente Supabase
// Durante o build, usamos valores placeholder para permitir que o build complete
// Em runtime (quando a API route for chamada), as variáveis devem estar configuradas no Vercel
export const supabaseAdmin = createClient(
  apiEnv.SUPABASE_URL,
  apiEnv.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
