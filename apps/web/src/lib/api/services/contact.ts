import { supabaseAdmin } from '../supabase';
import { normalizePhoneCanonical } from '../utils';
import type { LeadCampaign } from '@/types';

export interface ContactData {
  channelType: 'whatsapp' | 'instagram';
  externalId: string;
  name?: string;
  phone?: string;
  email?: string;
  profilePicUrl?: string;
  metadata?: Record<string, any>;
  /** Origem da campanha (Facebook Ads, Instagram etc.) — mesclado em metadata.campaign */
  campaign?: LeadCampaign | null;
  /**
   * O `name` é só um placeholder (ex.: "Instagram 443563", usado quando a API de perfil não
   * responde). Nesse caso um nome real já salvo é preservado — sem isso, uma única falha
   * temporária da Meta apagaria o nome do contato.
   */
  nameIsFallback?: boolean;
}

/** Escolhe o nome a gravar sem nunca rebaixar um nome real para um placeholder. */
function pickName(data: ContactData, currentName?: string | null): string | null | undefined {
  if (!data.name) return currentName;
  if (data.nameIsFallback && currentName && currentName.trim()) return currentName;
  return data.name;
}

/** Busca o contato de um canal pelo ID externo (o mesmo par usado no upsert). */
export async function getContactByChannel(channelType: string, externalId: string) {
  const { data } = await supabaseAdmin
    .from('contacts')
    .select('id, name, profile_pic_url, updated_at')
    .eq('channel_type', channelType)
    .eq('external_id', externalId)
    .maybeSingle();
  return data as { id: string; name: string | null; profile_pic_url: string | null; updated_at: string | null } | null;
}

export async function upsertContact(data: ContactData) {
  // 1) Buscar por (channel_type, external_id) — contato já existente neste canal
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
    const mergedMeta = { ...(existing.metadata || {}), ...(data.metadata || {}) };
    if (data.campaign && Object.keys(data.campaign).length > 0) {
      mergedMeta.campaign = { ...data.campaign, attributed_at: data.campaign.attributed_at || new Date().toISOString() };
    }
    const updatePayload: Record<string, unknown> = {
      name: pickName(data, existing.name),
      phone: data.phone ?? existing.phone,
      profile_pic_url: data.profilePicUrl || existing.profile_pic_url,
      metadata: mergedMeta,
      updated_at: new Date().toISOString(),
    };
    if (data.email !== undefined) {
      updatePayload.email = data.email || null;
    }
    const { data: updated, error } = await supabaseAdmin
      .from('contacts')
      .update(updatePayload)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return updated;
  }

  // 2) Não encontrou neste canal: tentar identificar contato existente por telefone (canônico) ou e-mail
  //    Assim, se o aluno já está em Contatos (ex.: criado pela Guru), a nova conversa WhatsApp usa o mesmo contato
  const phoneCanon = data.phone ? normalizePhoneCanonical(data.phone) : '';
  const emailNorm = data.email?.trim().toLowerCase() || '';
  if (phoneCanon || emailNorm) {
    const { data: list } = await supabaseAdmin
      .from('contacts')
      .select('id, phone, email, name')
      .limit(5000);
    const rows = Array.isArray(list) ? list : [];
    const matched = rows.find((c) => {
      if (phoneCanon && c.phone && normalizePhoneCanonical(c.phone) === phoneCanon) return true;
      if (emailNorm && c.email && c.email.trim().toLowerCase() === emailNorm) return true;
      return false;
    });
    if (matched) {
      const { data: current } = await supabaseAdmin
        .from('contacts')
        .select('*')
        .eq('id', matched.id)
        .single();
      if (current) {
        const mergedMeta = { ...(current.metadata || {}), ...(data.metadata || {}) };
        if (data.campaign && Object.keys(data.campaign).length > 0) {
          mergedMeta.campaign = { ...data.campaign, attributed_at: data.campaign.attributed_at || new Date().toISOString() };
        }
        const updatePayload: Record<string, unknown> = {
          name: pickName(data, current.name),
          phone: data.phone ?? current.phone,
          profile_pic_url: data.profilePicUrl || current.profile_pic_url,
          metadata: mergedMeta,
          updated_at: new Date().toISOString(),
        };
        if (data.email !== undefined) updatePayload.email = data.email || null;
        const { data: updated, error } = await supabaseAdmin
          .from('contacts')
          .update(updatePayload)
          .eq('id', current.id)
          .select()
          .single();
        if (!error && updated) return updated;
      }
    }
  }

  // 3) Criar novo contato
  const newMetadata = { ...(data.metadata || {}) };
  if (data.campaign && Object.keys(data.campaign).length > 0) {
    newMetadata.campaign = { ...data.campaign, attributed_at: data.campaign.attributed_at || new Date().toISOString() };
  }
  const { data: created, error } = await supabaseAdmin
    .from('contacts')
    .insert({
      channel_type: data.channelType,
      external_id: data.externalId,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      profile_pic_url: data.profilePicUrl,
      metadata: newMetadata,
    })
    .select()
    .single();

  if (error) throw error;
  return created;
}
