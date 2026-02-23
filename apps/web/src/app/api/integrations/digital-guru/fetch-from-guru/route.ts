import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/integrations/digital-guru/fetch-from-guru
 *
 * Busca vendas na API da Guru. A API exige pelo menos um de: ordered_at_ini, confirmed_at_ini,
 * cancelled_at_ini, contact_id, subscription_id, invoice_id. Quando o usuário envia só email/phone,
 * usamos intervalo de datas (ordered_at_ini / ordered_at_end) e filtramos por email/telefone no nosso código.
 * A API da Guru não permite período maior que 180 dias — usamos 180 dias quando não há datas na query.
 *
 * DOC GURU: https://docs.digitalmanager.guru/developers/transactions
 */
function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeEmailForMatch(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}
function normalizePhoneForMatch(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

function transactionMatchesContact(t: unknown, email: string, phone: string): boolean {
  if (!t || typeof t !== 'object') return false;
  const o = t as Record<string, unknown>;
  const contact = o.contact as Record<string, unknown> | undefined;
  if (!contact || typeof contact !== 'object') return false;
  const cEmail = normalizeEmailForMatch(contact.email as string);
  const cPhone = normalizePhoneForMatch(contact.phone_full_number as string || contact.phone_number as string);
  if (email && cEmail && cEmail === email) return true;
  if (phone && cPhone && (cPhone === phone || cPhone === phone.replace(/^55/, '') || cPhone === `55${phone}`)) return true;
  return false;
}
export async function GET(request: NextRequest) {
  const userToken = apiEnv.DIGITAL_GURU_USER_TOKEN;
  let baseUrl = apiEnv.DIGITAL_GURU_API_BASE_URL?.trim().replace(/\/$/, '');

  if (!userToken || !baseUrl) {
    return NextResponse.json(
      {
        error: 'Busca na Guru não configurada',
        message:
          'Configure no servidor (Vercel ou .env): DIGITAL_GURU_USER_TOKEN (Meu Perfil → Tokens API na Guru) e DIGITAL_GURU_API_BASE_URL (URL do endpoint de transações). Documentação: https://docs.digitalmanager.guru/developers/transactions',
        configured: false,
      },
      { status: 501 }
    );
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.trim() || '';
  let phone = (searchParams.get('phone')?.trim() || '').replace(/\D/g, '');

  if (!email && !phone) {
    return NextResponse.json(
      { error: 'Envie pelo menos um: email ou phone na query.' },
      { status: 400 }
    );
  }

  if (phone && !phone.startsWith('55') && phone.length >= 10) {
    phone = `55${phone}`;
  }

  const orderedAtIni = searchParams.get('ordered_at_ini')?.trim() || '';
  const orderedAtEnd = searchParams.get('ordered_at_end')?.trim() || '';
  const contactId = searchParams.get('contact_id')?.trim() || '';

  const endDate = orderedAtEnd || toDateOnly(new Date());
  const maxDays = 180;
  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() - maxDays);
  const startDate = orderedAtIni || toDateOnly(defaultStart);

  try {
    const params = new URLSearchParams();
    if (contactId) {
      params.set('contact_id', contactId);
      if (email) params.set('email', email);
      if (phone) params.set('phone', phone);
    } else {
      params.set('ordered_at_ini', startDate);
      params.set('ordered_at_end', endDate);
    }

    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}${params.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { _raw: text.slice(0, 500) };
    }

    if (!res.ok) {
      const detail = typeof data === 'object' && data && 'message' in (data as object) ? (data as { message?: string }).message : text.slice(0, 500);
      const bodyStr = JSON.stringify(data);
      const is180DaysError = /180\s*days|period\s*greater/i.test(bodyStr);
      console.error('[Digital Guru fetch] API respondeu:', res.status, '(URL omitida)', detail?.slice(0, 200));
      return NextResponse.json({
        ok: false,
        error: 'A API da Guru respondeu com erro',
        guru_status: res.status,
        detail: detail || `HTTP ${res.status}`,
        hint: is180DaysError
          ? 'A API da Guru não permite período maior que 180 dias. Use intervalos de até 180 dias (ordered_at_ini e ordered_at_end) ou importe colando o JSON.'
          : res.status === 401
            ? 'User Token inválido ou expirado. Gere um novo em Meu Perfil → Tokens API na Guru e atualize DIGITAL_GURU_USER_TOKEN.'
            : 'Confira DIGITAL_GURU_API_BASE_URL (URL exata do endpoint) e DIGITAL_GURU_USER_TOKEN (User Token, não Account Token). Docs: https://docs.digitalmanager.guru/developers/transactions',
        transactions: [],
      });
    }

    let transactions: unknown[] = [];
    if (Array.isArray(data)) {
      transactions = data;
    } else if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.data)) transactions = obj.data;
      else if (Array.isArray(obj.transactions)) transactions = obj.transactions;
      else if (Array.isArray(obj.results)) transactions = obj.results;
      else if (Array.isArray(obj.orders)) transactions = obj.orders;
      else if (Array.isArray(obj.items)) transactions = obj.items;
    }

    if ((email || phone) && transactions.length > 0) {
      transactions = transactions.filter((t) => transactionMatchesContact(t, email, phone));
    }

    return NextResponse.json({
      ok: true,
      transactions,
      total: transactions.length,
      message:
        transactions.length > 0
          ? `${transactions.length} venda(s) encontrada(s). Use "Importar estas vendas" para trazer para o MonsterChat.`
          : 'Nenhuma venda encontrada na Guru para esse e-mail/telefone. Verifique os dados ou a documentação da API (parâmetros de filtro).',
      ...(transactions.length === 0 && data && typeof data === 'object' ? { _responseKeys: Object.keys(data as object) } : {}),
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    console.error('[Digital Guru fetch] Erro:', isAbort ? 'Timeout' : error);
    return NextResponse.json({
      ok: false,
      error: isAbort ? 'Timeout ao conectar na API da Guru' : 'Erro ao buscar na Guru',
      detail: error instanceof Error ? error.message : String(error),
      hint: isAbort
        ? 'A API da Guru demorou mais de 20s para responder. Tente de novo ou use "Importar vendas antigas" colando o JSON.'
        : 'Verifique DIGITAL_GURU_API_BASE_URL (acessível do servidor?), rede e logs da Vercel.',
      transactions: [],
    });
  }
}
