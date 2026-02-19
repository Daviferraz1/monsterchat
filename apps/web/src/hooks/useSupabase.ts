import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export function useSupabase() {
  const [supabase] = useState(() => createClient());
  return supabase;
}
