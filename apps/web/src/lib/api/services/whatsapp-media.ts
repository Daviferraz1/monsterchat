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
