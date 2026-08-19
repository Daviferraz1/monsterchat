import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cliente Supabase para código de servidor (API routes) que precisa saber QUEM está
 * logado — o supabaseAdmin (service_role) não tem sessão, então não serve para isso.
 *
 * Atenção à versão: @supabase/ssr 0.0.10 só entende a interface get/set/remove.
 * A forma getAll/setAll (versões mais novas) é aceita sem erro e simplesmente não
 * devolve cookie nenhum — o resultado é sessão sempre nula e 401 silencioso.
 * É a mesma interface usada em src/middleware.ts; mantenha as duas iguais.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Component não pode escrever cookie. O middleware já renova a
            // sessão a cada request, então ignorar aqui é seguro.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // idem
          }
        },
      },
    }
  );
}
