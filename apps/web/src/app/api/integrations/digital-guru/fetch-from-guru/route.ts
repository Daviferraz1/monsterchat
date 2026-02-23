import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/integrations/digital-guru/fetch-from-guru
 *
 * Busca vendas diretamente na API da Guru por e-mail e/ou telefone.
 * Requer: DIGITAL_GURU_USER_TOKEN e DIGITAL_GURU_API_BASE_URL.
 *
 * DOC GURU: https://docs.digitalmanager.guru/developers/transactions
 * - Autenticação: Authorization: Bearer {User Token} (Meu Perfil → Tokens API)
 * - DIGITAL_GURU_API_BASE_URL: URL completa do endpoint (ex.: https://api.digitalmanager.guru/v1/transactions)
 *   Se a Guru usar outro path (ex.: /myorders, /orders), configure a URL completa.
 */
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

  try {
    const params = new URLSearchParams();
    if (email) {
      params.set('email', email);
    }
    if (phone) {
      params.set('phone', phone);
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
      console.error('[Digital Guru fetch] API respondeu:', res.status, '(URL omitida)', detail?.slice(0, 200));
      return NextResponse.json({
        ok: false,
        error: 'A API da Guru respondeu com erro',
        guru_status: res.status,
        detail: detail || `HTTP ${res.status}`,
        hint: res.status === 401
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
