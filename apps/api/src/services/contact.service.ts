import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import type { ChannelType } from '../types/common.types.js';

export interface ContactData {
  channelType: ChannelType;
  externalId: string;
  name?: string;
  phone?: string;
  profilePicUrl?: string;
  metadata?: Record<string, any>;
}

/**
 * Cria ou atualiza um contato baseado no channel_type e external_id
 */
export async function upsertContact(data: ContactData) {
  try {
    const { data: contact, error } = await supabase
      .from('contacts')
      .upsert(
        {
          channel_type: data.channelType,
          external_id: data.externalId,
          name: data.name,
          phone: data.phone,
          profile_pic_url: data.profilePicUrl,
          metadata: data.metadata || {},
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'channel_type,external_id',
        }
      )
      .select()
      .single();

    if (error) {
      logger.error('Error upserting contact', error, {
        channelType: data.channelType,
        externalId: data.externalId,
      });
      throw error;
    }

    logger.debug('Contact upserted', {
      contactId: contact.id,
      channelType: data.channelType,
      externalId: data.externalId,
    });

    return contact;
  } catch (error) {
    logger.error('Failed to upsert contact', error);
    throw error;
  }
}

/**
 * Atualiza apenas a foto de perfil do contato (ex.: Baileys).
 */
export async function updateContactProfilePic(
  contactId: string,
  profilePicUrl: string
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({
      profile_pic_url: profilePicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contactId);

  if (error) {
    logger.error('Error updating contact profile pic', error, { contactId });
    throw error;
  }
}

/**
 * Busca um contato por channel_type e external_id
 */
export async function getContactByExternalId(
  channelType: ChannelType,
  externalId: string
) {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('channel_type', channelType)
      .eq('external_id', externalId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found, que é ok
      logger.error('Error fetching contact', error);
      throw error;
    }

    return data || null;
  } catch (error) {
    logger.error('Failed to get contact', error);
    throw error;
  }
}
