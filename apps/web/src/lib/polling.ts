/**
 * Recarga periódica em segundo plano — a rede de segurança do tempo real.
 *
 * A fonte primária de atualização é o `postgres_changes` do Supabase: é ele que
 * traz a mensagem nova na hora (o som de notificação depende só dele). Estes
 * intervalos existem para o caso do websocket cair sem avisar.
 *
 * Eram de 1s a 5s, o que fazia o celular baixar a lista inteira de conversas 30x
 * por minuto e o histórico completo do chat 60x por minuto — na casa de 100 MB
 * por hora em dados móveis. Como redundância, dezenas de segundos bastam.
 */
export const POLL_MESSAGES_MS = 20_000;
export const POLL_CONVERSATIONS_MS = 30_000;
export const POLL_BOARD_MS = 30_000;
export const POLL_UNREAD_MS = 30_000;

/** Com a aba oculta (tela apagada, atendente no WhatsApp) ninguém está lendo. */
function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

/**
 * Chama `load` a cada `intervalMs`, mas só com a aba visível — e uma vez ao
 * voltar para ela, para que a tela nunca fique mostrando dado velho de quando o
 * telefone foi guardado no bolso.
 *
 * Devolve a função de limpeza para usar direto no return do useEffect.
 */
export function startPolling(load: () => void, intervalMs: number): () => void {
  const interval = setInterval(() => {
    if (isVisible()) load();
  }, intervalMs);

  const onVisibilityChange = () => {
    if (isVisible()) load();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

/** Janela em que uma rajada de eventos do tempo real vira uma recarga só. */
export const REALTIME_THROTTLE_MS = 3_000;

export interface ThrottledReload {
  (): void;
  cancel: () => void;
}

/**
 * Limita a frequência de uma recarga disparada pelo tempo real.
 *
 * O `postgres_changes` de `conversations` dispara a cada mensagem que entra ou
 * sai, porque toda mensagem mexe em `last_message_at` — e o handler recarrega a
 * lista inteira. Numa conta movimentada isso sozinho já refazia a busca de
 * poucos em poucos segundos, desfazendo a economia dos intervalos.
 *
 * A primeira chamada passa direto (mensagem nova continua aparecendo na hora) e
 * as seguintes dentro da janela viram uma única recarga no fim dela — nunca
 * adiando para sempre, como um debounce puro faria com eventos contínuos.
 */
export function throttleReload(load: () => void, waitMs = REALTIME_THROTTLE_MS): ThrottledReload {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    timer = null;
    lastRun = Date.now();
    load();
  };

  const call = (() => {
    const elapsed = Date.now() - lastRun;
    if (elapsed >= waitMs) {
      run();
      return;
    }
    if (timer === null) timer = setTimeout(run, waitMs - elapsed);
  }) as ThrottledReload;

  call.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  return call;
}
