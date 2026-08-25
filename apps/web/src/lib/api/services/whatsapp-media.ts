import axios from 'axios';
import { supabaseAdmin } from '../supabase';
import { isSupabasePlaceholder } from '../env';

const BUCKET = 'media';

/** Garante que o bucket existe; cria se não existir (ignora erro "already exists"). */
async function ensureBucketExists(): Promise<void> {
  const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 52428800,
    allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/*'],
  });
  if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
    console.warn('[WhatsApp media] Bucket create (ignorando):', error.message);
  }
}

/** Quanto tempo a foto de perfil espelhada vale antes de ser baixada de novo. */
const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Espelha a foto de perfil do contato no Supabase.
 *
 * A URL que a Meta devolve em `profile_pic` é assinada e expira em poucos dias — guardada crua
 * no banco, o avatar simplesmente some da inbox depois de um tempo. O caminho aqui é estável por
 * contato, então o refresh sobrescreve o arquivo em vez de acumular lixo no bucket.
 *
 * Só baixa de novo quando a cópia passou do TTL, para não puxar a imagem a cada mensagem recebida.
 * Se o Supabase não estiver configurado ou o upload falhar, devolve a URL da Meta (o avatar
 * continua aparecendo, só que temporariamente).
 */
export async function storeContactAvatarInSupabase(
  metaUrl: string,
  channelType: string,
  externalId: string,
  current?: { profile_pic_url?: string | null; updated_at?: string | null } | null
): Promise<string> {
  if (isSupabasePlaceholder()) return metaUrl;

  const safeId = externalId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `avatars/${channelType}/${safeId}.jpg`;

  const mirrored = current?.profile_pic_url;
  if (mirrored && mirrored.includes(path)) {
    const age = current?.updated_at ? Date.now() - new Date(current.updated_at).getTime() : Infinity;
    if (age < AVATAR_TTL_MS) return mirrored;
  }

  try {
    await ensureBucketExists();

    // A URL de foto de perfil da Meta já vem assinada: não mandar Authorization aqui.
    const res = await axios.get<ArrayBuffer>(metaUrl, {
      responseType: 'arraybuffer',
      maxContentLength: 5 * 1024 * 1024,
      timeout: 20000,
    });

    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, res.data, {
      contentType: String(res.headers['content-type'] || 'image/jpeg'),
      upsert: true,
    });
    if (error) {
      console.warn('[Avatar] Upload falhou, usando a URL da Meta:', error.message, { path });
      return metaUrl;
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    console.log('[Avatar] Foto de perfil espelhada:', path);
    // O caminho é fixo, então o cache-buster garante que o navegador pegue a foto nova no refresh.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (err) {
    console.warn('[Avatar] Não foi possível espelhar a foto:', err instanceof Error ? err.message : err);
    return metaUrl;
  }
}

/**
 * Baixa informações da mídia do WhatsApp usando Graph API
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ url: string; mimeType: string; sha256: string }> {
  const url = `https://graph.facebook.com/v21.0/${mediaId}`;
  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      access_token: accessToken,
    },
  });

  return {
    url: response.data.url,
    mimeType: response.data.mime_type,
    sha256: response.data.sha256,
  };
}

function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/amr': 'amr',
    'audio/aac': 'aac',
  };
  return map[mimeType?.toLowerCase()] || 'bin';
}

/**
 * Baixa a mídia da URL temporária da Meta (com token) e faz upload no Supabase Storage.
 * Retorna a URL pública permanente. Se Supabase não estiver configurado, retorna a URL temporária.
 */
export async function storeWhatsAppMediaInSupabase(
  mediaId: string,
  accessToken: string,
  conversationId: string,
  options: { mimeType?: string; contentType?: string; filename?: string }
): Promise<{ url: string; mimeType: string }> {
  const meta = await downloadWhatsAppMedia(mediaId, accessToken);
  const mimeType = meta.mimeType || options.mimeType || 'application/octet-stream';

  if (isSupabasePlaceholder()) {
    console.warn('[WhatsApp media] Supabase não configurado (placeholder). Usando URL temporária da Meta.');
    return { url: meta.url, mimeType };
  }

  try {
    await ensureBucketExists();

    const downloadRes = await axios.get<ArrayBuffer>(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
      maxContentLength: 50 * 1024 * 1024,
      timeout: 60000,
    });

    const buffer = downloadRes.data;
    const ext = extFromMime(mimeType);
    const safeName = (options.filename || `file`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const path = `inbound/${conversationId}/${Date.now()}-${safeName}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error('[WhatsApp media] Erro ao fazer upload no Supabase:', error.message, { path, bucket: BUCKET });
      return { url: meta.url, mimeType };
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    console.log('[WhatsApp media] Mídia salva no Supabase:', path);
    return { url: urlData.publicUrl, mimeType };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WhatsApp media] Erro ao baixar ou enviar mídia:', msg, err instanceof Error ? err : undefined);
    return { url: meta.url, mimeType };
  }
}

/**
 * Baixa mídia de uma URL da Meta (ex.: anexo do Instagram) com Bearer token e faz upload no Supabase.
 * Usado pelo webhook do Instagram onde a URL já vem no payload.
 */
export async function storeMetaUrlMediaInSupabase(
  metaUrl: string,
  accessToken: string,
  conversationId: string,
  options: { mimeType?: string; contentType?: string; filename?: string }
): Promise<{ url: string; mimeType: string }> {
  const mimeType = options.mimeType || options.contentType || 'application/octet-stream';

  if (isSupabasePlaceholder()) {
    console.warn('[Meta media] Supabase não configurado. Usando URL temporária da Meta.');
    return { url: metaUrl, mimeType };
  }

  try {
    await ensureBucketExists();

    const downloadRes = await axios.get<ArrayBuffer>(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseType: 'arraybuffer',
      maxContentLength: 50 * 1024 * 1024,
      timeout: 60000,
    });

    const buffer = downloadRes.data;
    const ext = extFromMime(mimeType);
    const safeName = (options.filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const path = `inbound/${conversationId}/${Date.now()}-${safeName}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      console.error('[Meta media] Erro ao fazer upload no Supabase:', error.message, { path });
      return { url: metaUrl, mimeType };
    }

    const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    console.log('[Meta media] Mídia salva no Supabase:', path);
    return { url: urlData.publicUrl, mimeType };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Meta media] Erro ao baixar ou enviar mídia:', msg);
    return { url: metaUrl, mimeType };
  }
}
