import { createBrowserClient } from '@supabase/ssr';

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_ANON_KEY;

  // Se a URL é do seu projeto mas a chave é a placeholder, o build foi feito sem NEXT_PUBLIC_SUPABASE_ANON_KEY.
  // Não usar placeholder key com URL real (causa 401).
  const isRealUrl = supabaseUrl !== PLACEHOLDER_URL && supabaseUrl.includes('supabase.co');
  const isPlaceholderKey = supabaseKey === PLACEHOLDER_ANON_KEY;
  if (isRealUrl && isPlaceholderKey) {
    console.error(
      '[Supabase] NEXT_PUBLIC_SUPABASE_ANON_KEY não está configurada. Configure no .env (local) ou nas variáveis do Vercel e faça um novo build/deploy.'
    );
  }

  try {
    return createBrowserClient(supabaseUrl, supabaseKey);
  } catch (error) {
    console.warn('Failed to create Supabase client:', error);
    return createBrowserClient(PLACEHOLDER_URL, PLACEHOLDER_ANON_KEY);
  }
}
