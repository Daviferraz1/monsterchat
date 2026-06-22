'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Gravação de voz para o chat.
 *
 * Engine primária: **opus-recorder** → gera ogg/opus mono, que é o formato de
 * voice note nativo do WhatsApp (a Cloud API renderiza ogg/opus como mensagem de
 * voz, com onda e play). O worker (com o WASM embutido) é servido de
 * `/opus/encoderWorker.min.js` (em apps/web/public/opus).
 *
 * Fallback: se o opus-recorder não carregar/for suportado, usa o MediaRecorder
 * nativo; nesse caso o arquivo sai em webm/mp4 e quem chamar deve converter para
 * MP3 antes de enviar (a Cloud API rejeita webm/mp4 do Chrome).
 */

const OPUS_WORKER_PATH = '/opus/encoderWorker.min.js';

/** Melhor formato do MediaRecorder (fallback), priorizando ogg/opus. */
function pickMime(): { mimeType: string; ext: string } {
  const candidates = [
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/ogg', ext: 'ogg' },
    { mimeType: 'audio/mp4', ext: 'm4a' },
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
  ];
  if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
    for (const c of candidates) if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return { mimeType: '', ext: 'webm' };
}

type OpusRecorderInstance = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  ondataavailable: ((typedArray: Uint8Array) => void) | null;
  onstart: (() => void) | null;
  onstop: (() => void) | null;
};

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<'opus' | 'media' | null>(null);
  // opus-recorder
  const opusRef = useRef<OpusRecorderInstance | null>(null);
  // MediaRecorder (fallback)
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeRef = useRef<{ mimeType: string; ext: string }>({ mimeType: '', ext: 'webm' });
  // compartilhado
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((f: File | null) => void) | null>(null);
  const cancelledRef = useRef(false);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const settle = (file: File | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(file);
  };

  const startOpus = useCallback(async (): Promise<boolean> => {
    try {
      const mod = await import('opus-recorder');
      const Recorder = mod.default;
      if (!Recorder.isRecordingSupported()) return false;
      const rec = new Recorder({
        encoderPath: OPUS_WORKER_PATH,
        encoderApplication: 2048, // OPUS_APPLICATION_VOIP — voz
        encoderSampleRate: 48000,
        numberOfChannels: 1, // mono (exigência do WhatsApp p/ ogg)
        streamPages: false,
      }) as unknown as OpusRecorderInstance;
      cancelledRef.current = false;
      rec.ondataavailable = (typedArray: Uint8Array) => {
        if (cancelledRef.current || !typedArray || typedArray.length === 0) {
          settle(null);
          return;
        }
        const bytes = new Uint8Array(typedArray); // garante backing ArrayBuffer (tipos do TS)
        const blob = new Blob([bytes], { type: 'audio/ogg' });
        settle(new File([blob], `audio-${Date.now()}.ogg`, { type: 'audio/ogg' }));
      };
      rec.onstart = () => {
        setRecording(true);
        startTimer();
      };
      rec.onstop = () => {
        stopTimer();
        setRecording(false);
        // segurança: se nenhum dado chegou, não deixa o stop() pendurado
        if (resolveRef.current) settle(null);
      };
      opusRef.current = rec;
      await rec.start();
      return true;
    } catch (e) {
      console.warn('[useVoiceRecorder] opus-recorder indisponível, caindo para MediaRecorder', e);
      opusRef.current = null;
      return false;
    }
  }, []);

  const startMedia = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      mimeRef.current = mime;
      const mr = new MediaRecorder(stream, mime.mimeType ? { mimeType: mime.mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        cleanupStream();
        stopTimer();
        setRecording(false);
        if (cancelledRef.current) {
          settle(null);
          return;
        }
        const type = (mimeRef.current.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) {
          settle(null);
          return;
        }
        settle(new File([blob], `audio-${Date.now()}.${mimeRef.current.ext}`, { type }));
      };
      mediaRef.current = mr;
      mr.start();
      setRecording(true);
      startTimer();
      return true;
    } catch (e) {
      console.error('[useVoiceRecorder] MediaRecorder falhou', e);
      cleanupStream();
      return false;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Seu navegador não suporta gravação de áudio.');
      return;
    }
    engineRef.current = null;
    if (await startOpus()) {
      engineRef.current = 'opus';
      return;
    }
    if (await startMedia()) {
      engineRef.current = 'media';
      return;
    }
    setError('Não consegui acessar o microfone. Permita o acesso ao microfone no navegador.');
    setRecording(false);
  }, [startOpus, startMedia]);

  /** Para a gravação e resolve com o arquivo (ogg/opus na engine opus; webm/mp4 no fallback). */
  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      cancelledRef.current = false;
      resolveRef.current = resolve;
      if (engineRef.current === 'opus' && opusRef.current) {
        void opusRef.current.stop();
      } else if (engineRef.current === 'media' && mediaRef.current && mediaRef.current.state !== 'inactive') {
        mediaRef.current.stop();
      } else {
        settle(null);
      }
    });
  }, []);

  /** Cancela e descarta a gravação. */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (engineRef.current === 'opus' && opusRef.current) {
      void opusRef.current.stop();
    } else if (engineRef.current === 'media' && mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    } else {
      cleanupStream();
      stopTimer();
      setRecording(false);
    }
  }, []);

  return { recording, seconds, error, start, stop, cancel };
}
