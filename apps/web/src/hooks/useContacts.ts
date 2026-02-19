import { useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';
import type { Contact } from '@/types';

export function useContacts() {
  const supabase = useSupabase();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error loading contacts:', error);
        setLoading(false);
        return;
      }
      setContacts(data || []);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel('contacts-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return { contacts, loading };
}
