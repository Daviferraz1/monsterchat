'use client';

import { useEffect, useState } from 'react';

const PAUSA_MS = 1000;

export interface ErroOrtografia {
  offset: number;
  length: number;
  palavra: string;
}

/**
 * Palavras com erro de ortografia no texto (sublinhado vermelho da caixa de mensagem).
 * Confere depois de 1 s sem digitar. Enquanto o texto muda, os erros já achados
 * continuam valendo onde a palavra ainda está no mesmo lugar.
 */
export function useCorretor(texto: string, ativo: boolean): ErroOrtografia[] {
  const [achados, setAchados] = useState<ErroOrtografia[]>([]);

  useEffect(() => {
    if (!ativo || texto.trim().length < 3 || texto.startsWith('/')) {
      setAchados([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/spell/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: texto }),
          signal: ctrl.signal,
        });
        const d = await res.json();
        setAchados(
          ((d.erros ?? []) as Array<{ offset: number; length: number }>).map((e) => ({
            ...e,
            palavra: texto.slice(e.offset, e.offset + e.length),
          }))
        );
      } catch {
        /* abortado ou fora do ar: fica sem sublinhado */
      }
    }, PAUSA_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [texto, ativo]);

  // Só os que ainda batem com o texto atual (ele pode ter mudado desde a consulta).
  return achados.filter((e) => texto.slice(e.offset, e.offset + e.length) === e.palavra);
}

/** Corta o texto em trechos normais e trechos com erro, para desenhar o sublinhado. */
export function trechosComErro(texto: string, erros: ErroOrtografia[]): Array<{ t: string; erro: boolean }> {
  const out: Array<{ t: string; erro: boolean }> = [];
  let pos = 0;
  for (const e of [...erros].sort((a, b) => a.offset - b.offset)) {
    if (e.offset < pos) continue;
    if (e.offset > pos) out.push({ t: texto.slice(pos, e.offset), erro: false });
    out.push({ t: texto.slice(e.offset, e.offset + e.length), erro: true });
    pos = e.offset + e.length;
  }
  if (pos < texto.length) out.push({ t: texto.slice(pos), erro: false });
  return out;
}
