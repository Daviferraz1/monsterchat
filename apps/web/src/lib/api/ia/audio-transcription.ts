/**
 * Transcrição dos áudios que o aluno manda (WhatsApp/Instagram).
 *
 * A IA só lia mensagens de texto: num "Com o sequencial abate matéria?" logo
 * depois de um áudio, ela respondia sem saber o que tinha sido dito. Agora, ao
 * montar a conversa para a sugestão, os áudios sem transcrição são transcritos
 * pelo Gemini (a chave já é usada nos embeddings) e o texto fica guardado em
 * messages.metadata.transcricao — cada áudio é transcrito uma vez só, e o
 * inbox mostra o texto embaixo do player.
 */
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';

const MODELO = 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
/** Áudio de WhatsApp é curto; acima disso não vale baixar e mandar inline. */
const MAX_BYTES = 15 * 1024 * 1024;
/** Por sugestão: o resto fica para a próxima (a sugestão não pode travar). */
const MAX_POR_VEZ = 3;

const PROMPT =
  'Transcreva este áudio em português do Brasil, fielmente, como foi falado. ' +
  'Corrija só a pontuação. Trecho que não dá para entender: escreva [inaudível]. ' +
  'Sem fala (silêncio ou só ruído): responda apenas [sem fala]. ' +
  'Responda somente com a transcrição, sem comentários.';

function mimeSuportado(mime: string | null | undefined): string {
  const m = (mime ?? '').split(';')[0].trim().toLowerCase();
  // WhatsApp grava voz como audio/ogg (opus); Instagram, audio/mpeg ou mp4.
  if (m === 'audio/mpeg' || m === 'audio/mp3') return 'audio/mp3';
  if (m.startsWith('audio/')) return m;
  if (m === 'video/mp4') return 'audio/mp4';
  return 'audio/ogg';
}

/** Texto do áudio, ou null se não deu (sem chave, arquivo grande, falha da API). */
export async function transcreverAudio(url: string, mime?: string | null): Promise<string | null> {
  const key = apiEnv.GEMINI_API_KEY;
  if (!key || !url) return null;
  try {
    const arq = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!arq.ok) return null;
    const buf = Buffer.from(await arq.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return null;

    const res = await fetch(`${BASE}/${MODELO}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: PROMPT }, { inlineData: { mimeType: mimeSuportado(mime), data: buf.toString('base64') } }],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    });
    if (!res.ok) {
      console.error('[transcricao] Gemini HTTP', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return null;
    }
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const bruto = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    // O modelo marca trechos de silêncio com [sem fala] mesmo quando há fala no resto
    // (visto num áudio do Instagram): só fica a marca se o áudio inteiro for silêncio.
    const falado = bruto
      .split(/\n+/)
      .filter((l) => !/^\s*\[sem fala\]\s*$/i.test(l))
      .join('\n')
      .trim();
    return falado || (bruto ? '[sem fala]' : null);
  } catch (err) {
    console.error('[transcricao]', err);
    return null;
  }
}

type MsgAudio = {
  id: string;
  media_url: string | null;
  media_mime_type: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Transcreve os áudios recebidos da conversa que ainda não têm transcrição
 * (os mais recentes primeiro, até MAX_POR_VEZ) e grava o texto na mensagem.
 */
export async function transcreverAudiosPendentes(conversationId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('messages')
    .select('id, media_url, media_mime_type, metadata')
    .eq('conversation_id', conversationId)
    .eq('direction', 'inbound')
    .eq('content_type', 'audio')
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);
  const pendentes = ((data ?? []) as MsgAudio[]).filter((m) => !m.metadata?.transcricao).slice(0, MAX_POR_VEZ);

  await Promise.all(
    pendentes.map(async (m) => {
      const texto = await transcreverAudio(m.media_url!, m.media_mime_type);
      if (!texto) return;
      await supabaseAdmin
        .from('messages')
        .update({
          metadata: { ...(m.metadata ?? {}), transcricao: texto, transcricao_em: new Date().toISOString(), transcricao_modelo: MODELO },
        })
        .eq('id', m.id);
    })
  );
}
