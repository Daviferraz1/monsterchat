'use client';

import { useCallback, useEffect, useState } from 'react';

const PAUSA_MS = 700;

/**
 * Continuação sugerida pela IA para o que o atendente está digitando (ver
 * /api/ia/completar). Pede depois de uma pausa na digitação; se ele continuar
 * digitando exatamente o que foi sugerido, a sugestão vai encolhendo em vez de
 * sumir. Esc descarta até o texto mudar.
 */
export function useAutocompletar(conversationId: string, texto: string, ativo: boolean) {
  const [sug, setSug] = useState<{ base: string; cont: string } | null>(null);
  const [descartadoEm, setDescartadoEm] = useState<string | null>(null);

  const completo = sug ? sug.base + sug.cont : '';
  const continuacao = sug && texto.startsWith(sug.base) && completo.startsWith(texto) ? completo.slice(texto.length) : '';

  useEffect(() => {
    if (continuacao) return; // digitou o que estava sugerido: segue valendo
    setSug(null);
    if (!ativo || texto === descartadoEm || texto.trim().length < 3 || texto.startsWith('/') || texto.length > 2000) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/ia/completar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, texto }),
          signal: ctrl.signal,
        });
        const d = await res.json().catch(() => ({}));
        if (typeof d.continuacao === 'string' && d.continuacao) setSug({ base: texto, cont: d.continuacao });
      } catch {
        /* abortado: o atendente voltou a digitar */
      }
    }, PAUSA_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // continuacao fora das dependências de propósito: ela deriva de texto + sug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, ativo, conversationId, descartadoEm]);

  const descartar = useCallback(() => {
    setDescartadoEm(texto);
    setSug(null);
  }, [texto]);

  const limpar = useCallback(() => setSug(null), []);

  return { continuacao, descartar, limpar };
}
