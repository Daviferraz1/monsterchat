'use client';

import { useNewMessageSound } from '@/hooks/useNewMessageSound';

/**
 * Componente invisível que escuta novas mensagens (inbound) e toca o som de notificação.
 * Deve ser montado no layout do dashboard (apenas quando o usuário está logado).
 */
export function NewMessageSound() {
  useNewMessageSound();
  return null;
}
