import { createClient } from '@supabase/supabase-js';
import { apiEnv } from './env';

// Criar cliente Supabase
// Durante o build, usamos valores placeholder para permitir que o build complete
// Em runtime (quando a API route for chamada), as variáveis devem estar configuradas no Vercel
//
// `cache: 'no-store'`: o Next 14 estende o `fetch` e guarda respostas GET no
// Data Cache — inclusive as do PostgREST, cuja URL de um `select` sem filtro
// variável é sempre a mesma. Visto em 22/09/2026: `boas_vindas_config` mudava
// no banco e a rota `force-dynamic` continuava lendo o valor antigo. Uma régua
// que não vê `ativo = true` (ou pior, não vê `ativo = false`) não é aceitável,
// então o cliente admin nunca usa o cache.
export const supabaseAdmin = createClient(
  apiEnv.SUPABASE_URL,
  apiEnv.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' }),
    },
  }
);
