import { supabaseAdmin } from '../supabase';

export interface ContactData {
  channelType: 'whatsapp' | 'instagram';
  externalId: string;
  name?: string;
  phone?: string;
  profilePicUrl?: string;
  metadata?: Record<string, any>;
}

export async function upsertContact(data: ContactData) {
  // Verificar se contato já existe (maybeSingle: 0 linhas não é erro)
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('channel_type', data.channelType)
    .eq('external_id', data.externalId)
    .maybeSingle();

  if (selectError) {
    console.error('[Contact] Erro ao buscar contato:', selectError);
    throw selectError;
  }
  if (existing) {
    // Atualizar contato existente
    const { data: updated, error } = await supabaseAdmin
      .from('contacts')
      .update({
        name: data.name || existing.name,
        phone: data.phone || existing.phone,
        profile_pic_url: data.profilePicUrl || existing.profile_pic_url,
        metadata: data.metadata || existing.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  // Criar novo contato
  const { data: created, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      channel_type: data.channelType,
      external_id: data.externalId,
      name: data.name,
      phone: data.phone,
      profile_pic_url: data.profilePicUrl,
      metadata: data.metadata || {},
    })
    .select()
    .single();

  if (error) throw error;
  return created;
}
