import { supabaseAdmin } from '../supabase';

export async function getChannelByExternalId(
  type: 'whatsapp' | 'instagram',
  externalId: string
) {
  const { data, error } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('type', type)
    .eq('external_id', externalId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}
