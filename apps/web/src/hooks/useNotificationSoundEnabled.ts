'use client';

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'monsterchat_notification_sound_enabled';

function getStored(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v === 'true';
  } catch {
    return true;
  }
}

/**
 * Preferência do usuário: ativar ou desativar o som ao receber nova mensagem.
 * Persiste em localStorage (chave: monsterchat_notification_sound_enabled). Padrão: true.
 */
export function useNotificationSoundEnabled(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabledState] = useState(() => getStored());

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  return [enabled, setEnabled];
}

/** Retorna o valor atual da preferência (para uso fora de React, ex.: no hook do som). */
export function getNotificationSoundEnabled(): boolean {
  return getStored();
}
