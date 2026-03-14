import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

/** Normaliza telefone para busca (só dígitos). */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
}

/**
 * GET: busca contatos por e-mail ou telefone (para integrar Resend e identificar contato).
 * Query: email= OU phone= (pelo menos um). Retorna contatos que batem em qualquer um dos dois.
 * Assim o sistema identifica se o contato já existe (por email ou telefone) para atualizar credenciais.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email')?.trim()?.toLowerCase();
    const phone = searchParams.get('phone')?.trim();
    const phoneDigits = normalizePhone(phone);

    if (!email && !phoneDigits) {
      return NextResponse.json({ error: 'Informe email= ou phone=', contacts: [] }, { status: 400 });
    }

    const conditions: { column: string; value: string }[] = [];
    if (email) conditions.push({ column: 'email', value: email });
    if (phoneDigits) conditions.push({ column: 'phone', value: phoneDigits });

    const allIds = new Set<string>();
    const contactMap = new Map<string, { id: string; name: string | null; email: string | null; phone: string | null }>();

    for (const { column, value } of conditions) {
      if (column === 'email') {
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .select('id, name, email, phone')
          .not('email', 'is', null)
          .ilike('email', value);
        if (!error && data) {
          const exact = (data as { id: string; name: string | null; email: string | null; phone: string | null }[]).filter(
            (c) => c.email?.trim().toLowerCase() === value
          );
          exact.forEach((c) => {
            allIds.add(c.id);
            contactMap.set(c.id, c);
          });
        }
      } else {
        const { data, error } = await supabaseAdmin
          .from('contacts')
          .select('id, name, email, phone')
          .not('phone', 'is', null);
        if (!error && data) {
          const list = (data as { id: string; name: string | null; email: string | null; phone: string | null }[]).filter(
            (c) => normalizePhone(c.phone) === value
          );
          list.forEach((c) => {
            allIds.add(c.id);
            contactMap.set(c.id, c);
          });
        }
      }
    }

    const contacts = Array.from(allIds).map((id) => contactMap.get(id)!).filter(Boolean);
    return NextResponse.json({ contacts });
  } catch (err) {
    console.error('[API contacts GET]', err);
    return NextResponse.json({ contacts: [] }, { status: 500 });
  }
}

/**
 * POST: cria um contato (ex.: quando não existe e queremos salvar credenciais do Resend).
 * Body: { email, name?, phone? }. Identificador interno: channel_type='email', external_id=email.
 * Quando esse usuário entrar em contato depois (WhatsApp etc.), o sistema pode vincular por email/telefone e já mostrar login/senha.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() || null : null;
    const phone = typeof body.phone === 'string' ? body.phone.trim() || null : null;

    if (!email) {
      return NextResponse.json({ error: 'email é obrigatório' }, { status: 400 });
    }

    const externalId = `email:${email}`;
    const { data, error } = await supabaseAdmin
      .from('contacts')
      .upsert(
        {
          channel_type: 'email',
          external_id: externalId,
          email,
          name: name || email.split('@')[0] || null,
          phone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'channel_type,external_id' }
      )
      .select('id, name, email, phone')
      .single();

    if (error) {
      console.warn('[API contacts POST]', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API contacts POST]', err);
    return NextResponse.json({ error: 'Erro ao criar contato' }, { status: 500 });
  }
}
