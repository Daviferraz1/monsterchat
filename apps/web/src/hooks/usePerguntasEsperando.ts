'use client';

import { useEffect, useState } from 'react';

export interface Esperando {
  desde: string;
  trecho: string;
}

const INTERVALO_MS = 60 * 1000;

// Uma busca por minuto para a tela inteira, mesmo com lista e filtros usando o hook.
let atual: Map<string, Esperando> = new Map();
const ouvintes = new Set<(m: Map<string, Esperando>) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function buscar() {
  try {
    const d = await (await fetch('/api/conversations/esperando')).json();
    const m = new Map<string, Esperando>();
    for (const i of (d.itens ?? []) as Array<{ conversationId: string; desde: string; trecho: string }>) {
      m.set(i.conversationId, { desde: i.desde, trecho: i.trecho });
    }
    atual = m;
    ouvintes.forEach((f) => f(m));
  } catch {
    /* mantém o último resultado */
  }
}

/** Conversas com pergunta real do aluno sem resposta (selo ⏳ e filtro da lista). */
export function usePerguntasEsperando(): Map<string, Esperando> {
  const [mapa, setMapa] = useState(atual);
  useEffect(() => {
    ouvintes.add(setMapa);
    if (!timer) {
      buscar();
      timer = setInterval(buscar, INTERVALO_MS);
    }
    return () => {
      ouvintes.delete(setMapa);
      if (!ouvintes.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return mapa;
}

/** "25 min", "3h", "2 dias". */
export function tempoEsperando(desde: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(desde).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)} dias`;
}
