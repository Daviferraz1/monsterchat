import axios from 'axios';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const MEDIA_BUCKET = 'media';

/**
 * Faz upload de um buffer para o bucket 'media' e retorna a URL pública.
 * Usado por Baileys para persistir imagem, áudio, vídeo, documento recebidos.
 */
export async function uploadBufferToMedia(
  buffer: Buffer,
  path: string,
  mimeType: string
): Promise<{ url: string; path: string }> {
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    logger.error('Error uploading buffer to Supabase', error, { path });
    throw error;
  }

  const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  logger.debug('Media buffer uploaded', { path, url: urlData.publicUrl });
  return { url: urlData.publicUrl, path: data.path };
}

/**
 * Faz download de uma URL e faz upload para Supabase Storage
 */
export async function downloadAndUploadMedia(
  url: string,
  bucket: string,
  path: string,
  mimeType?: string
): Promise<{ url: string; path: string }> {
  try {
    // Download da URL
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'MonsterChat/1.0',
      },
    });

    const buffer = Buffer.from(response.data);
    const contentType = mimeType || response.headers['content-type'] || 'application/octet-stream';

    // Upload para Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      logger.error('Error uploading media to Supabase', error, {
        bucket,
        path,
      });
      throw error;
    }

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    logger.debug('Media uploaded successfully', {
      bucket,
      path,
      url: urlData.publicUrl,
    });

    return {
      url: urlData.publicUrl,
      path: data.path,
    };
  } catch (error) {
    logger.error('Failed to download and upload media', error);
    throw error;
  }
}
