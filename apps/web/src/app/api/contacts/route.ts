import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

/**
 * GET: busca contatos por e-mail (para integrar Resend: salvar credenciais no contato certo).
 * Query: email= (obrigatório) — retorna contatos cujo email coincide (case-insensitive).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email')?.trim()?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Parâmetro email é obrigatório', contacts: [] }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .select('id, name, email, phone')
      .not('email', 'is', null)
      .ilike('email', email);

    if (error) {
      console.warn('[API contacts GET]', error.message);
      return NextResponse.json({ contacts: [] });
    }
    const list = (data ?? []).filter((c) => c.email?.trim().toLowerCase() === email);
    return NextResponse.json({ contacts: list });
  } catch (err) {
    console.error('[API contacts GET]', err);
    return NextResponse.json({ contacts: [] }, { status: 500 });
  }
}
