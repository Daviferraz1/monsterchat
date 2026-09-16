'use client';

import { useSyncExternalStore } from 'react';

/** Mesmo ponto de corte do `md:` do Tailwind, para o JS e o CSS não discordarem. */
const QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

/**
 * Diz se estamos em tela de desktop (md+), medido em JS e não em CSS.
 *
 * `hidden md:flex` esconde o elemento mas o React monta assim mesmo: a lista de
 * conversas ficava montada duas vezes no celular — a visível e a da coluna de
 * desktop — e cada cópia rodava seu próprio poll, dobrando o consumo de dados.
 * Com isto, só a que aparece na tela chega a existir.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // No servidor não há viewport: assume mobile e corrige na hidratação.
    () => false
  );
}
