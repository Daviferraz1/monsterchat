'use client';

import { useEffect, useRef } from 'react';
import { useSupabase } from './useSupabase';
import { getNotificationSoundEnabled } from './useNotificationSoundEnabled';

/** Som de notificação (WhatsApp meme) — toca a cada nova mensagem recebida. Arquivo em public/sounds/new-message.mp3 */
const NOTIFICATION_SOUND_URL = '/sounds/new-message.mp3';

/**
 * Inscreve-se em novas mensagens recebidas (inbound) e toca o som de notificação.
 * Use no layout do dashboard para que o som toque em qualquer página quando chegar uma mensagem.
 */
export function useNewMessageSound() {
  const supabase = useSupabase();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const play = () => {
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
        }
        const a = audioRef.current;
        a.volume = 0.7;
        a.currentTime = 0;
        a.play().catch(() => {});
      } catch {
        // Ignora falha de autoplay
      }
    };

    const channel = supabase
      .channel('new_message_sound')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const raw = (payload as { new?: Record<string, unknown> }).new ?? (payload as { record?: Record<string, unknown> }).record;
          if (raw && raw.direction === 'inbound' && getNotificationSoundEnabled()) {
            play();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);
}
