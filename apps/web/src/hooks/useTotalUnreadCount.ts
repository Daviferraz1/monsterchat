import { useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';

/**
 * Retorna a contagem real total de mensagens não lidas (soma de unread_count em todas as conversas).
 * Usado no badge do rail (desktop e mobile). Atualiza em tempo real quando a tabela conversations muda.
 */
export function useTotalUnreadCount(): number {
  const supabase = useSupabase();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!supabase) return;

    const fetchTotal = async () => {
      const { data, error } = await supabase.rpc('get_total_unread_count');
      if (error) return;
      const n = typeof data === 'number' ? data : parseInt(String(data), 10);
      if (!Number.isNaN(n) && n >= 0) setTotal(n);
    };

    fetchTotal();
    const interval = setInterval(fetchTotal, 5000);

    const channel = supabase
      .channel('total_unread')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => {
          fetchTotal();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return total;
}
