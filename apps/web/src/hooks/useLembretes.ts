'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from './useSupabase';
import { useTeamDirectory } from './useTeamDirectory';

/** Disparado por quem cria, conclui ou adia um lembrete, para a lista atualizar na hora. */
export const EVENTO_LEMBRETES = 'monsterchat:lembretes-mudaram';

export function avisarMudancaLembretes(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_LEMBRETES));
}

/**
 * Lembretes abertos da pessoa logada, por conversa (o mais próximo de cada uma).
 * Lembrete é tarefa do quadro com prazo e conversa ligada (ver chat/Lembrete.tsx).
 */
export function useLembretes(): Map<string, string> {
  const supabase = useSupabase();
  const { me } = useTeamDirectory();
  const [porConversa, setPorConversa] = useState<Map<string, string>>(new Map());

  const carregar = useCallback(async () => {
    if (!me?.userId) return;
    const { data } = await supabase
      .from('tasks')
      .select('conversation_id, due_at')
      .eq('assigned_to', me.userId)
      .neq('status', 'closed')
      .not('conversation_id', 'is', null)
      .not('due_at', 'is', null)
      .order('due_at');
    const mapa = new Map<string, string>();
    for (const t of (data ?? []) as Array<{ conversation_id: string; due_at: string }>) {
      if (!mapa.has(t.conversation_id)) mapa.set(t.conversation_id, t.due_at);
    }
    setPorConversa(mapa);
  }, [supabase, me?.userId]);

  useEffect(() => {
    carregar();
    // O minuto que passa transforma "hoje 15:00" em atrasado; e outra aba pode ter mexido.
    const t = setInterval(carregar, 60 * 1000);
    window.addEventListener(EVENTO_LEMBRETES, carregar);
    return () => {
      clearInterval(t);
      window.removeEventListener(EVENTO_LEMBRETES, carregar);
    };
  }, [carregar]);

  return porConversa;
}

/** "hoje 15:00", "amanhã 09:00", "07/10 09:00". */
export function quandoLembrete(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = (x: Date) => x.toDateString();
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  if (dia(d) === dia(new Date())) return `hoje ${hora}`;
  if (dia(d) === dia(amanha)) return `amanhã ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}
