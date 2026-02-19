'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSupabase } from '@/hooks/useSupabase';

/**
 * Redireciona para /login se não houver sessão.
 * As políticas RLS do Supabase só permitem leitura de conversas/mensagens para usuários autenticados.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase();
  const router = useRouter();

  useEffect(() => {
    if (!supabase) return;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
      }
    };

    check();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/login');
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]);

  return <>{children}</>;
}
