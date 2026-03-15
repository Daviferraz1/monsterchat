/**
 * Busca credenciais de acesso (login/senha) por e-mail do contato.
 * Usado para sugestão de mensagem quando o aluno diz que não recebeu o acesso:
 * pesquisamos contatos com esse e-mail e retornamos as credenciais já salvas (vindas do Resend).
 */

import { supabaseAdmin } from './supabase';

const PLATFORM_LABELS: Record<string, string> = {
  monster_study: 'Monster Study',
  monster_questoes: 'Monster Questões',
  monster_sound: 'Monster Sound',
};

export interface CredentialByEmailRow {
  platform: string;
  platformLabel: string;
  login: string;
  password: string;
  sent_at: string | null;
}

/**
 * Retorna credenciais de todos os contatos que tenham o e-mail informado.
 * Agrupa por plataforma (usa a mais recente por contato se houver duplicata).
 */
export async function getCredentialsByEmail(email: string): Promise<CredentialByEmailRow[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];

  const { data: contacts, error: contactsError } = await supabaseAdmin
    .from('contacts')
    .select('id, email')
    .not('email', 'is', null)
    .ilike('email', normalized);

  if (contactsError || !contacts?.length) return [];

  const contactIds = (contacts as { id: string; email: string | null }[])
    .filter((c) => c.email?.trim().toLowerCase() === normalized)
    .map((c) => c.id);

  if (contactIds.length === 0) return [];

  const { data: creds, error: credsError } = await supabaseAdmin
    .from('contact_access_credentials')
    .select('platform, login, password, sent_at')
    .in('contact_id', contactIds)
    .order('sent_at', { ascending: false });

  if (credsError || !creds?.length) return [];

  const seen = new Set<string>();
  const list: CredentialByEmailRow[] = [];
  for (const row of creds as Array<{ platform: string; login: string; password: string; sent_at: string | null }>) {
    if (seen.has(row.platform)) continue;
    seen.add(row.platform);
    list.push({
      platform: row.platform,
      platformLabel: PLATFORM_LABELS[row.platform] ?? row.platform,
      login: row.login,
      password: row.password,
      sent_at: row.sent_at,
    });
  }
  return list;
}
