import axios from 'axios';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

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
