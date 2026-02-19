import { supabaseAdmin } from '../supabase';

export async function getChannelByExternalId(
  type: 'whatsapp' | 'instagram',
  externalId: string
) {
  const id = String(externalId).trim();
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('type', type)
    .eq('external_id', id)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/** Busca canal por external_id mesmo inativo (para mensagens de erro mais claras). */
export async function getChannelByExternalIdMaybeInactive(
  type: 'whatsapp' | 'instagram',
  externalId: string
) {
  const id = String(externalId).trim();
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('type', type)
    .eq('external_id', id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data;
}
