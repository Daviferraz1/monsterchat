/**
 * Integração Resend: listar e-mails enviados, obter conteúdo e extrair login/senha
 * para salvar em contatos e reenviar acesso ao aluno no chat.
 */

import { Resend } from 'resend';
import { apiEnv } from '../env';

export const RESEND_PLATFORMS = ['monster_study', 'monster_questoes', 'monster_sound'] as const;
export type ResendPlatform = (typeof RESEND_PLATFORMS)[number];

export interface ResendEmailListItem {
  id: string;
  to: string[];
  from: string;
  subject: string;
  created_at: string;
  last_event: string;
}

export interface ResendEmailDetail extends ResendEmailListItem {
  html: string | null;
  text: string | null;
}

export interface ParsedCredentials {
  login: string | null;
  password: string | null;
}

function getClient(): Resend | null {
  const key = apiEnv.RESEND_API_KEY;
  if (!key || key.startsWith('placeholder')) return null;
  return new Resend(key);
}

/**
 * Lista e-mails enviados (Resend API).
 * Retorna também hasMore para paginar e buscar e-mails mais antigos (enviados antes da integração).
 */
export async function listResendEmails(options?: { limit?: number; after?: string }): Promise<{
  emails: ResendEmailListItem[];
  hasMore: boolean;
}> {
  const resend = getClient();
  if (!resend) return { emails: [], hasMore: false };
  try {
    const { data, error } = await resend.emails.list({
      limit: options?.limit ?? 20,
      ...(options?.after && { after: options.after }),
    });
    if (error) {
      console.warn('[Resend] list error', error);
      return { emails: [], hasMore: false };
    }
    const payload = data as { data?: ResendEmailListItem[]; has_more?: boolean };
    const list = payload?.data ?? [];
    const arr = Array.isArray(list) ? list : [];
    const emails = arr.map((e) => ({
      ...e,
      to: Array.isArray(e.to) ? e.to : (e.to ? [String(e.to)] : []),
    }));
    return { emails, hasMore: payload?.has_more === true };
  } catch (err) {
    console.error('[Resend] list', err);
    return { emails: [], hasMore: false };
  }
}

/**
 * Obtém um e-mail enviado com corpo (html/text).
 */
export async function getResendEmail(id: string): Promise<ResendEmailDetail | null> {
  const resend = getClient();
  if (!resend) return null;
  try {
    const { data, error } = await resend.emails.get(id);
    if (error || !data) {
      console.warn('[Resend] get', id, error);
      return null;
    }
    const d = data as ResendEmailDetail;
    return {
      id: d.id,
      to: Array.isArray(d.to) ? d.to : [String(d.to)],
      from: d.from ?? '',
      subject: d.subject ?? '',
      created_at: d.created_at ?? '',
      last_event: d.last_event ?? '',
      html: d.html ?? null,
      text: d.text ?? null,
    };
  } catch (err) {
    console.error('[Resend] get', id, err);
    return null;
  }
}

/**
 * Extrai login (e-mail) e senha do corpo do e-mail.
 * Ajustado para o formato dos e-mails Monster (Monster Study, Monster Questões, Monster Sound):
 * - "E-mail:" ou "<strong>E-mail:</strong> email@..."
 * - "Senha:" com valor em texto ou dentro de <span style="...">senha</span>
 */
export function parseCredentialsFromEmailBody(html: string | null, text: string | null): ParsedCredentials {
  const htmlPart = html ?? '';
  const textPart = text ?? '';
  const raw = [textPart, htmlPart].join('\n');
  const normalized = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  let login: string | null = null;
  let password: string | null = null;

  // 1) Padrão Monster: <strong>E-mail:</strong> email@... e Senha: <span ...>senha</span>
  if (htmlPart) {
    const spanPass = htmlPart.match(/Senha\s*:[\s\S]*?<span[^>]*>([^<]+)<\/span>/i);
    if (spanPass) password = spanPass[1].trim();
    const emailInHtml = htmlPart.match(/(?:E-mail|e-mail)\s*:\s*(?:<\/[^>]+>)?\s*([a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailInHtml) login = emailInHtml[1].trim();
  }

  // 2) Texto plano ou fallback: "E-mail: x" e "Senha: x" (ou Senha: algo alfanumérico)
  if (!login) {
    const emailMatch = normalized.match(/(?:E-mail|e-mail)\s*:\s*([a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
      ?? normalized.match(/([a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) login = emailMatch[1].trim();
  }
  if (!password) {
    const passMatch = normalized.match(/Senha\s*:\s*([a-zA-Z0-9]{4,})/i)
      ?? normalized.match(/(?:senha|password)\s*[:\s]+\s*([a-zA-Z0-9]{4,})/i);
    if (passMatch) password = passMatch[1].trim();
  }

  return { login, password };
}
