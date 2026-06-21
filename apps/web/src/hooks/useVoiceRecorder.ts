'use client';

import { useCallback, useRef, useState } from 'react';

/** Escolhe o melhor formato de gravação disponível, priorizando os aceitos pelo WhatsApp (ogg/opus, mp4/aac). */
function pickMime(): { mimeType: string; ext: string } {
  const candidates = [
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/ogg', ext: 'ogg' },
    { mimeType: 'audio/mp4', ext: 'm4a' },
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
  ];
  if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    }
  }
  return { mimeType: '', ext: 'webm' };
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<{ mimeType: string; ext: string }>({ mimeType: '', ext: 'webm' });
  const resolveRef = useRef<((f: File | null) => void) | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Seu navegador não suporta gravação de áudio.');
      return;
    }
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
        cleanup();
        setRecording(false);
        const resolve = resolveRef.current;
        resolveRef.current = null;
        if (cancelledRef.current) {
          resolve?.(null);
          return;
        }
        const type = (mimeRef.current.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) {
          resolve?.(null);
          return;
        }
        const file = new File([blob], `audio-${Date.now()}.${mimeRef.current.ext}`, { type });
        resolve?.(file);
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('Não consegui acessar o microfone. Permita o acesso ao microfone no navegador.');
      cleanup();
      setRecording(false);
    }
  }, [cleanup]);

  /** Para a gravação e resolve com o arquivo de áudio (ou null se vazio). */
  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      const mr = recorderRef.current;
      if (!mr || mr.state === 'inactive') {
        resolve(null);
        return;
      }
      cancelledRef.current = false;
      resolveRef.current = resolve;
      mr.stop();
    });
  }, []);

  /** Cancela e descarta a gravação. */
  const cancel = useCallback(() => {
    const mr = recorderRef.current;
    cancelledRef.current = true;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
    } else {
      cleanup();
      setRecording(false);
    }
  }, [cleanup]);

  return { recording, seconds, error, start, stop, cancel };
}
