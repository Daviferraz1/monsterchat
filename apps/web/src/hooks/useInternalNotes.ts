'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';
import type { InternalNote } from '@/types';

const SELECT =
  'id, conversation_id, task_id, author_id, body, media_url, media_path, media_mime_type, media_filename, media_size, created_at';

/** Alvo do recado: uma conversa OU uma tarefa (nunca os dois — ver constraint na 043). */
export interface NoteTarget {
  conversationId?: string | null;
  taskId?: string | null;
}

/**
 * Thread interna da equipe numa conversa.
 *
 * Leitura direto pelo PostgREST (a RLS da 039 já limita ao escopo de quem olha);
 * escrita pela rota de servidor, que carimba o autor a partir da sessão.
 */
export function useInternalNotes(target: NoteTarget) {
  const conversationId = target.conversationId ?? null;
  const taskId = target.taskId ?? null;
  const ownerId = conversationId ?? taskId;
  const column = conversationId ? 'conversation_id' : 'task_id';
  const supabase = useSupabase();
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) {
      setNotes([]);
      return;
    }
    const { data, error: queryError } = await supabase
      .from('internal_notes')
      .select(SELECT)
      .eq(column, ownerId)
      .order('created_at', { ascending: true });
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setError(null);
    setNotes((data ?? []) as InternalNote[]);
  }, [ownerId, column, supabase]);

  useEffect(() => {
    if (!ownerId) return;
    setLoading(true);
    load().finally(() => setLoading(false));

    const channel = supabase
      .channel(`internal-notes-${ownerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'internal_notes',
          filter: `${column}=eq.${ownerId}`,
        },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ownerId, column, load, supabase]);

  /** Publica um recado, com anexo opcional. Sobe o arquivo antes de gravar a nota. */
  const addNote = useCallback(
    async (body: string, file?: File | null) => {
      if (!ownerId) return false;
      const text = body.trim();
      if (!text && !file) return false;

      setSending(true);
      setError(null);
      try {
        let media: { path: string; mime: string; name: string; size: number } | null = null;

        if (file) {
          const form = new FormData();
          form.append('file', file);
          form.append(conversationId ? 'conversation_id' : 'task_id', ownerId);
          form.append('scope', 'internal');
          const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
          const uploadData = await uploadRes.json().catch(() => ({}));
          if (!uploadRes.ok || !uploadData?.path) {
            setError(typeof uploadData?.error === 'string' ? uploadData.error : 'Falha no upload.');
            return false;
          }
          media = { path: uploadData.path, mime: file.type, name: file.name, size: file.size };
        }

        const res = await fetch('/api/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            taskId,
            body: text,
            mediaPath: media?.path,
            mediaMimeType: media?.mime,
            mediaFilename: media?.name,
            mediaSize: media?.size,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data?.error === 'string' ? data.error : 'Falha ao enviar.');
          return false;
        }
        // Não espera o realtime: aparece na hora para quem escreveu.
        if (data?.note) setNotes((list) => [...list, data.note as InternalNote]);
        return true;
      } finally {
        setSending(false);
      }
    },
    [ownerId, conversationId, taskId]
  );

  return { notes, loading, sending, error, addNote, reload: load };
}
