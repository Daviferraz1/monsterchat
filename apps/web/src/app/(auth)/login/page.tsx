'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const supabase = useSupabase();
  const router = useRouter();
  const configured = isSupabaseConfigured();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mounted || !supabase || !configured) return;
    
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      router.push('/inbox');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[100dvh] p-4">
      <div className="w-full max-w-md p-6 sm:p-8 border rounded-xl shadow-lg">
        <h1 className="text-2xl font-bold mb-6">MonsterChat</h1>

        {mounted && !configured && (
          <div className="mb-4 p-4 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-sm">
            <p className="font-semibold mb-2">Supabase não configurado neste deploy</p>
            <p className="mb-2">O login falha porque as variáveis do Supabase não estão definidas (ou o build usou placeholders).</p>
            <p className="mb-1"><strong>No Vercel:</strong></p>
            <ul className="list-disc list-inside space-y-1 mb-2">
              <li>Adicione <code className="bg-black/10 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> = URL do seu projeto (ex: https://xxx.supabase.co)</li>
              <li>Adicione <code className="bg-black/10 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> = chave anon do Supabase</li>
            </ul>
            <p>Depois faça um novo <strong>deploy</strong> (as variáveis NEXT_PUBLIC_* são embutidas no build).</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || (mounted && !configured)}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            {loading ? 'Entrando...' : mounted && !configured ? 'Configure o Supabase no Vercel' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
