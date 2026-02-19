import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

export function useSupabase() {
  // Criar cliente apenas uma vez quando o componente montar
  // Durante SSR/build, o cliente será criado com valores placeholder
  const [supabase] = useState(() => createClient());
  
  return supabase;
}
