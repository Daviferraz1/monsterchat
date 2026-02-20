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

/**
 * Para Instagram: o webhook envia recipient.id que pode ser o ID da conta do Instagram
 * (ex.: 17841403342667626), não o Page ID do Facebook. Busca por external_id ou business_account_id.
 */
export async function getInstagramChannelByRecipientId(recipientId: string) {
  const id = String(recipientId).trim();
  const { data: byExternal } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('type', 'instagram')
    .eq('external_id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (byExternal) return byExternal;

  const { data: byBusiness } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('type', 'instagram')
    .eq('business_account_id', id)
    .eq('is_active', true)
    .maybeSingle();

  return byBusiness ?? null;
}

/** Instagram: busca canal ativo ou inativo por recipient.id (external_id ou business_account_id). */
export async function getInstagramChannelMaybeInactiveByRecipientId(recipientId: string) {
  const id = String(recipientId).trim();
  const { data: byExternal } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('type', 'instagram')
    .eq('external_id', id)
    .maybeSingle();

  if (byExternal) return byExternal;

  const { data: byBusiness } = await supabaseAdmin
    .from('channels')
    .select('*')
    .eq('type', 'instagram')
    .eq('business_account_id', id)
    .maybeSingle();

  return byBusiness ?? null;
}
