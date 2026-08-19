'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';
import { statusPatch } from '@/lib/boardColumns';
import { isPriority } from '@/lib/priority';
import { compareBoardItems, fromConversation, fromTask, type BoardItem } from '@/lib/boardItem';
import type { Conversation, ConversationStatus, Task } from '@/types';

/** Teto de cards carregados de cada tipo. Sem isso a raia Concluída cresce sem fim. */
const MAX_CARDS = 200;

export interface BoardFilters {
  /** user_id do operador; 'todos' = equipe inteira; 'ninguem' = fila sem dono. */
  owner: string | 'todos' | 'ninguem';
  departmentId?: string;
  /** 'tudo' | 'conversas' | 'tarefas' */
  kind?: 'tudo' | 'conversas' | 'tarefas';
}

/**
 * Cards do quadro: conversas (com dono ou departamento) e tarefas internas.
 *
 * As duas coisas vivem em tabelas separadas de propósito (ver 043) e são unidas
 * só aqui, na leitura. A RLS de cada tabela já limita o que a pessoa enxerga —
 * os filtros abaixo são conveniência, não segurança.
 */
export function useBoard(filters: BoardFilters) {
  const supabase = useSupabase();
  const [items, setItems] = useState<BoardItem[]>([]);
  const [raw, setRaw] = useState<{ conversations: Conversation[]; tasks: Task[] }>({
    conversations: [],
    tasks: [],
  });
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { owner, departmentId, kind = 'tudo' } = filters;

  const load = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);

      const wantConversations = kind !== 'tarefas';
      const wantTasks = kind !== 'conversas';

      const conversationQuery = () => {
        let q = supabase
          .from('conversations')
          .select('*, contact:contacts(*), channel:channels(*)')
          .or('assigned_to.not.is.null,department_id.not.is.null')
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(MAX_CARDS);
        if (owner === 'ninguem') q = q.is('assigned_to', null);
        else if (owner !== 'todos') q = q.eq('assigned_to', owner);
        if (departmentId) q = q.eq('department_id', departmentId);
        return q;
      };

      const taskQuery = () => {
        let q = supabase
          .from('tasks')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(MAX_CARDS);
        if (owner === 'ninguem') q = q.is('assigned_to', null);
        else if (owner !== 'todos') q = q.eq('assigned_to', owner);
        if (departmentId) q = q.eq('department_id', departmentId);
        return q;
      };

      const [conversationRes, taskRes] = await Promise.all([
        wantConversations ? conversationQuery() : Promise.resolve({ data: [], error: null }),
        wantTasks ? taskQuery() : Promise.resolve({ data: [], error: null }),
      ]);

      if (conversationRes.error || taskRes.error) {
        setError(conversationRes.error?.message ?? taskRes.error?.message ?? 'Falha ao carregar');
        setLoading(false);
        return;
      }
      setError(null);

      const conversations = (conversationRes.data ?? []) as Conversation[];
      const tasks = (taskRes.data ?? []) as Task[];
      setRaw({ conversations, tasks });
      setItems(
        [...conversations.map(fromConversation), ...tasks.map(fromTask)].sort(compareBoardItems)
      );
      setTruncated(conversations.length >= MAX_CARDS || tasks.length >= MAX_CARDS);
      setLoading(false);

      // Recados internos por card, numa consulta para cada alvo.
      const counts: Record<string, number> = {};
      const [byConversation, byTask] = await Promise.all([
        conversations.length
          ? supabase.from('internal_notes').select('conversation_id').in('conversation_id', conversations.map((c) => c.id))
          : Promise.resolve({ data: [] }),
        tasks.length
          ? supabase.from('internal_notes').select('task_id').in('task_id', tasks.map((t) => t.id))
          : Promise.resolve({ data: [] }),
      ]);
      for (const row of (byConversation.data ?? []) as { conversation_id: string }[]) {
        counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1;
      }
      for (const row of (byTask.data ?? []) as { task_id: string }[]) {
        counts[row.task_id] = (counts[row.task_id] ?? 0) + 1;
      }
      setNoteCounts(counts);
    },
    [supabase, owner, departmentId, kind]
  );

  useEffect(() => {
    load(true);
    const interval = setInterval(() => load(false), 5000);
    const channel = supabase
      .channel('board-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => load(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => load(false))
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  /** Atualiza o card na tela antes da resposta; desfaz se o servidor recusar. */
  const optimistic = useCallback(
    (id: string, patch: Partial<BoardItem>) => {
      const previous = items;
      setItems((list) =>
        list.map((i) => (i.id === id ? { ...i, ...patch } : i)).sort(compareBoardItems)
      );
      return () => setItems(previous);
    },
    [items]
  );

  const patchTask = useCallback(async (id: string, body: Record<string, unknown>) => {
    const res = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? null : (typeof data?.error === 'string' ? data.error : 'Falha ao atualizar.');
  }, []);

  const changeStatus = useCallback(
    async (item: BoardItem, status: ConversationStatus) => {
      const rollback = optimistic(item.id, { status });
      const message =
        item.kind === 'task'
          ? await patchTask(item.id, { status })
          : (
              await supabase.from('conversations').update(statusPatch(status)).eq('id', item.id)
            ).error?.message ?? null;
      if (message) {
        rollback();
        setError('Não foi possível mover o card: ' + message);
        return false;
      }
      load(false);
      return true;
    },
    [optimistic, patchTask, supabase, load]
  );

  const changePriority = useCallback(
    async (item: BoardItem, priority: string) => {
      if (!isPriority(priority)) return false;
      const rollback = optimistic(item.id, { priority });
      const message =
        item.kind === 'task'
          ? await patchTask(item.id, { priority })
          : (
              await supabase
                .from('conversations')
                .update({ priority, updated_at: new Date().toISOString() })
                .eq('id', item.id)
            ).error?.message ?? null;
      if (message) {
        rollback();
        setError('Não foi possível mudar a prioridade: ' + message);
        return false;
      }
      return true;
    },
    [optimistic, patchTask, supabase]
  );

  /**
   * Assumir um card sem dono. Conversa passa pela rota de transferência de
   * propósito, para o movimento entrar no histórico como qualquer outra passagem
   * de mão; tarefa é uma atribuição direta.
   */
  const claim = useCallback(
    async (item: BoardItem, userId: string) => {
      if (item.kind === 'task') {
        const message = await patchTask(item.id, { assignedTo: userId });
        if (message) {
          setError(message);
          return false;
        }
      } else {
        const res = await fetch(`/api/conversations/${item.id}/transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toUserId: userId, reason: 'Assumida pelo quadro' }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data?.error === 'string' ? data.error : 'Falha ao assumir.');
          return false;
        }
      }
      await load(false);
      return true;
    },
    [patchTask, load]
  );

  /** Marca a tarefa como vista (só vale para o responsável — o servidor confere). */
  const markSeen = useCallback(
    async (item: BoardItem) => {
      if (item.kind !== 'task' || item.seenAt) return;
      await patchTask(item.id, { seen: true });
    },
    [patchTask]
  );

  return {
    items,
    raw,
    noteCounts,
    loading,
    truncated,
    error,
    changeStatus,
    changePriority,
    claim,
    markSeen,
    reload: () => load(false),
  };
}
