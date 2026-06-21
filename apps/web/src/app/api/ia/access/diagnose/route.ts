import { NextRequest, NextResponse } from 'next/server';
import { diagnosticarAcesso, isPlatformEnabled } from '@/lib/api/integrations/platform-access';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';

/** Diagnóstico de acesso do aluno na plataforma (read-only). Aceita email/cpf ou contactId. */
export async function POST(request: NextRequest) {
  try {
    if (!isPlatformEnabled()) {
      return NextResponse.json({ configured: false, resumo: 'Integração da plataforma não configurada.' });
    }
    const body = await request.json().catch(() => ({}));
    let email = typeof body.email === 'string' ? body.email.trim() : '';
    const cpf = typeof body.cpf === 'string' ? body.cpf.trim() : '';
    const contactId = typeof body.contactId === 'string' ? body.contactId : '';

    if (!email && contactId) {
      const { data } = await supabaseAdmin.from('contacts').select('email').eq('id', contactId).maybeSingle();
      if (data?.email) email = data.email;
    }

    if (!email && !cpf) {
      return NextResponse.json({ configured: true, resumo: 'Sem e-mail/CPF do contato para diagnosticar.', temAcesso: false, temCadastro: false });
    }

    const result = await diagnosticarAcesso({ email, cpf });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[API ia/access/diagnose]', err);
    return NextResponse.json({ configured: true, resumo: 'Falha ao diagnosticar.', temAcesso: false, temCadastro: false }, { status: 500 });
  }
}
