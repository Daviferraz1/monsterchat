import { useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';

/**
 * Contagem do badge do rail: mensagens não lidas + conversas que o atendente
 * marcou para voltar depois.
 *
 * A marca manual conta como 1, e só quando a conversa não tem mensagem nova —
 * senão a mesma conversa apareceria duas vezes no número. Sem somar a marca, o
 * badge zera e a conversa marcada some do radar, que é o oposto da função.
 */
export function useTotalUnreadCount(): number {
  const supabase = useSupabase();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!supabase) return;

    const fetchTotal = async () => {
      const [{ data, error }, { count: marcadas }] = await Promise.all([
        supabase.rpc('get_total_unread_count'),
        supabase
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('manually_unread', true)
          .eq('unread_count', 0),
      ]);
      if (error) return;
      const n = typeof data === 'number' ? data : parseInt(String(data), 10);
      if (!Number.isNaN(n) && n >= 0) setTotal(n + (marcadas ?? 0));
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
