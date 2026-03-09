import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import type { ChannelType } from '../types/common.types.js';

/**
 * Busca um canal ativo por tipo e external_id
 */
export async function getChannelByExternalId(
  type: ChannelType,
  externalId: string
) {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('type', type)
      .eq('external_id', externalId)
      .eq('is_active', true)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      logger.error('Error fetching channel', error);
      throw error;
    }

    return data || null;
  } catch (error) {
    logger.error('Failed to get channel', error);
    throw error;
  }
}

/**
 * Busca um canal por ID (qualquer tipo, ativo ou não)
 */
export async function getChannelById(id: string) {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      logger.error('Error fetching channel by id', error);
      throw error;
    }

    return data || null;
  } catch (error) {
    logger.error('Failed to get channel by id', error);
    throw error;
  }
}

/**
 * Busca todos os canais ativos de um tipo
 */
export async function getActiveChannels(type?: ChannelType) {
  try {
    let query = supabase
      .from('channels')
      .select('*')
      .eq('is_active', true);

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching channels', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    logger.error('Failed to get active channels', error);
    throw error;
  }
}
