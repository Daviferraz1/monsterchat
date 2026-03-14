import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

const PLATFORM_LABELS: Record<string, string> = {
  monster_study: 'Monster Study',
  monster_questoes: 'Monster Questões',
  monster_sound: 'Monster Sound',
};

/** GET: credenciais de acesso (login/senha) do contato para reenviar no chat */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from('contact_access_credentials')
      .select('id, platform, login, password, sent_at')
      .eq('contact_id', id)
      .order('sent_at', { ascending: false });

    if (error) {
      console.warn('[API contacts/:id/credentials]', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const list = (data ?? []).map((row) => ({
      ...row,
      platformLabel: PLATFORM_LABELS[row.platform] ?? row.platform,
    }));
    return NextResponse.json({ credentials: list });
  } catch (err) {
    console.error('[API contacts/:id/credentials]', err);
    return NextResponse.json({ error: 'Erro ao buscar credenciais', credentials: [] }, { status: 500 });
  }
}
