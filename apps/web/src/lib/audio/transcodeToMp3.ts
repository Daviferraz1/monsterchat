/**
 * Transcodifica um áudio gravado (webm/opus, mp4/aac, ogg/opus...) para MP3.
 *
 * Motivo: a WhatsApp Cloud API só aceita ogg/opus, m4a, mp3, aac, amr. O áudio
 * que o Chrome grava (audio/mp4) é rejeitado pela Meta ("on processing it is of
 * type application/octet-stream"). MP3 (audio/mpeg) é aceito de forma confiável
 * em qualquer navegador, então convertemos antes de enviar.
 *
 * Decodifica via Web Audio API (o navegador lê o formato que ele mesmo gravou) e
 * codifica com lamejs (JS puro). Saída: mono, 128 kbps — suficiente para voz.
 */
export async function transcodeToMp3(input: File | Blob, baseName = 'audio'): Promise<File> {
  const arrayBuffer = await input.arrayBuffer();

  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtx) throw new Error('AudioContext indisponível neste navegador.');

  const ctx = new AudioCtx();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close?.();
  }

  const { Mp3Encoder } = await import('@breezystack/lamejs');

  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Mp3Encoder(1, sampleRate, 128); // 1 canal (mono), 128 kbps

  // Mixa para mono e converte Float32 [-1,1] -> Int16 (PCM que o lamejs espera).
  const length = audioBuffer.length;
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    let s = right ? (left[i] + right[i]) / 2 : left[i];
    s = Math.max(-1, Math.min(1, s));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const mp3Chunks: Uint8Array[] = [];
  const BLOCK = 1152; // tamanho de frame do MP3
  for (let i = 0; i < samples.length; i += BLOCK) {
    const chunk = samples.subarray(i, i + BLOCK);
    const buf = encoder.encodeBuffer(chunk);
    if (buf.length > 0) mp3Chunks.push(new Uint8Array(buf));
  }
  const tail = encoder.flush();
  if (tail.length > 0) mp3Chunks.push(new Uint8Array(tail));

  const blob = new Blob(mp3Chunks as BlobPart[], { type: 'audio/mpeg' });
  return new File([blob], `${baseName}.mp3`, { type: 'audio/mpeg' });
}
