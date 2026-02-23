import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/integrations/digital-guru/fetch-from-guru
 *
 * Busca vendas diretamente na API da Guru por e-mail e/ou telefone (vendas que ainda não foram recebidas pelo webhook).
 * Requer: DIGITAL_GURU_USER_TOKEN e DIGITAL_GURU_API_BASE_URL configurados.
 * Query: email=..., phone=... (pelo menos um).
 *
 * A URL base deve apontar para o endpoint de listagem de transações da Guru (ex.: https://api.digitalmanager.guru/v1/transactions).
 * Consulte a documentação atual da Guru para o path e parâmetros exatos.
 */
export async function GET(request: NextRequest) {
  const userToken = apiEnv.DIGITAL_GURU_USER_TOKEN;
  const baseUrl = apiEnv.DIGITAL_GURU_API_BASE_URL?.replace(/\/$/, '');

  if (!userToken || !baseUrl) {
    return NextResponse.json(
      {
        error: 'Busca na Guru não configurada',
        message:
          'Para buscar vendas que ainda não foram recebidas, configure no servidor: DIGITAL_GURU_USER_TOKEN (User Token da Guru) e DIGITAL_GURU_API_BASE_URL (URL do endpoint de transações, ex.: https://api.digitalmanager.guru/v1/transactions). Consulte a documentação da Guru. Enquanto isso, use "Importar vendas antigas" com o JSON obtido da API ou exportação da Guru.',
        configured: false,
      },
      { status: 501 }
    );
  }

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.trim() || '';
  const phone = (searchParams.get('phone')?.trim() || '').replace(/\D/g, '');

  if (!email && !phone) {
    return NextResponse.json(
      { error: 'Envie pelo menos um: email ou phone na query.' },
      { status: 400 }
    );
  }

  try {
    const params = new URLSearchParams();
    if (email) params.set('email', email);
    if (phone) params.set('phone', phone);
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${params.toString()}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${userToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[Digital Guru fetch] API respondeu:', res.status, text);
      return NextResponse.json(
        {
          error: 'A API da Guru respondeu com erro',
          status: res.status,
          detail: text.slice(0, 500),
          hint: 'Verifique DIGITAL_GURU_API_BASE_URL e se o User Token tem permissão. Consulte a documentação da Guru.',
        },
        { status: 502 }
      );
    }

    const data = await res.json();
    let transactions: unknown[] = [];
    if (Array.isArray(data)) {
      transactions = data;
    } else if (data?.data && Array.isArray(data.data)) {
      transactions = data.data;
    } else if (data?.transactions && Array.isArray(data.transactions)) {
      transactions = data.transactions;
    } else if (data?.results && Array.isArray(data.results)) {
      transactions = data.results;
    }

    return NextResponse.json({
      ok: true,
      transactions,
      total: transactions.length,
      message:
        transactions.length > 0
          ? `${transactions.length} venda(s) encontrada(s) na Guru. Use "Importar estas vendas" para trazer para o MonsterChat.`
          : 'Nenhuma venda encontrada na Guru para esse e-mail/telefone.',
    });
  } catch (error) {
    console.error('[Digital Guru fetch] Erro:', error);
    return NextResponse.json(
      {
        error: 'Erro ao buscar na Guru',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
