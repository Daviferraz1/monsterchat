import { supabaseAdmin } from '../supabase';
import { normalizePhoneCanonical } from '../utils';

export interface LeadTrackingUtm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

/** Gera um código curto único para rastreamento por ref (redirecionamento direto sem formulário). */
function generateRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Registra um lead com UTM por telefone (fluxo com formulário). */
export async function createLeadTracking(phone: string, utm: LeadTrackingUtm) {
  const phoneCanonical = normalizePhoneCanonical(phone);
  if (!phoneCanonical) {
    throw new Error('Telefone inválido');
  }
  const { data, error } = await supabaseAdmin
    .from('lead_tracking')
    .insert({
      phone_canonical: phoneCanonical,
      utm_source: utm.utm_source || null,
      utm_medium: utm.utm_medium || null,
      utm_campaign: utm.utm_campaign || null,
      utm_content: utm.utm_content || null,
      utm_term: utm.utm_term || null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

/** Registra clique por ref (redirecionamento direto, sem formulário). Retorna o ref para colocar na mensagem do wa.me. */
export async function createLeadTrackingByRef(utm: LeadTrackingUtm): Promise<string> {
  const ref = generateRef();
  const { error } = await supabaseAdmin
    .from('lead_tracking')
    .insert({
      ref,
      phone_canonical: null,
      utm_source: utm.utm_source || null,
      utm_medium: utm.utm_medium || null,
      utm_campaign: utm.utm_campaign || null,
      utm_content: utm.utm_content || null,
      utm_term: utm.utm_term || null,
    });
  if (error) throw error;
  return ref;
}

/** Busca UTM por ref (código na mensagem). Usado no webhook quando a mensagem contém o ref. */
export async function getLeadTrackingByRef(
  ref: string,
  withinDays = 7
): Promise<(LeadTrackingUtm & { attributed_at: string }) | null> {
  const since = new Date();
  since.setDate(since.getDate() - withinDays);
  const { data, error } = await supabaseAdmin
    .from('lead_tracking')
    .select('utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at')
    .eq('ref', ref.trim())
    .gte('created_at', since.toISOString())
    .is('phone_canonical', null)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const hasAny = [data.utm_source, data.utm_medium, data.utm_campaign, data.utm_content, data.utm_term].some(Boolean);
  if (!hasAny) return null;
  return {
    utm_source: data.utm_source ?? undefined,
    utm_medium: data.utm_medium ?? undefined,
    utm_campaign: data.utm_campaign ?? undefined,
    utm_content: data.utm_content ?? undefined,
    utm_term: data.utm_term ?? undefined,
    attributed_at: data.created_at,
  };
}

/** Marca o registro de ref como usado (vincula phone) para não reutilizar. */
export async function markLeadTrackingRefUsed(ref: string, phoneCanonical: string): Promise<void> {
  await supabaseAdmin
    .from('lead_tracking')
    .update({ phone_canonical: phoneCanonical, ref: null })
    .eq('ref', ref.trim());
}

/** Lista refs não usados (últimos N dias) para identificar qual ref está na mensagem. */
async function getUnclaimedRefs(withinDays = 7): Promise<string[]> {
  const since = new Date();
  since.setDate(since.getDate() - withinDays);
  const { data, error } = await supabaseAdmin
    .from('lead_tracking')
    .select('ref')
    .not('ref', 'is', null)
    .is('phone_canonical', null)
    .gte('created_at', since.toISOString());
  if (error || !data) return [];
  return (data as { ref: string }[]).map((r) => r.ref).filter(Boolean);
}

/**
 * Encontra UTM quando a mensagem contém um dos nossos refs (código no final da mensagem).
 * Assim a mensagem pode ser amigável, ex.: "Olá! 👋 Quero conversar. 2KCR4SYH" — o código fica discreto.
 */
export async function getLeadTrackingByRefFromMessage(
  messageBody: string | undefined,
  withinDays = 7
): Promise<{ utm: LeadTrackingUtm & { attributed_at: string }; ref: string } | null> {
  if (!messageBody || typeof messageBody !== 'string') return null;
  const refs = await getUnclaimedRefs(withinDays);
  for (const ref of refs) {
    if (messageBody.includes(ref)) {
      const utm = await getLeadTrackingByRef(ref, withinDays);
      if (utm) return { utm, ref };
    }
  }
  return null;
}

/** Busca o registro de lead mais recente para o telefone (últimos 7 dias). Usado no webhook do WhatsApp para atribuir campanha ao contato. */
export async function getRecentLeadTrackingByPhone(
  phone: string,
  withinDays = 7
): Promise<LeadTrackingUtm & { attributed_at: string } | null> {
  const phoneCanonical = normalizePhoneCanonical(phone);
  if (!phoneCanonical) return null;
  const since = new Date();
  since.setDate(since.getDate() - withinDays);
  const { data, error } = await supabaseAdmin
    .from('lead_tracking')
    .select('utm_source, utm_medium, utm_campaign, utm_content, utm_term, created_at')
    .eq('phone_canonical', phoneCanonical)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const hasAny = [data.utm_source, data.utm_medium, data.utm_campaign, data.utm_content, data.utm_term].some(Boolean);
  if (!hasAny) return null;
  return {
    utm_source: data.utm_source ?? undefined,
    utm_medium: data.utm_medium ?? undefined,
    utm_campaign: data.utm_campaign ?? undefined,
    utm_content: data.utm_content ?? undefined,
    utm_term: data.utm_term ?? undefined,
    attributed_at: data.created_at,
  };
}
