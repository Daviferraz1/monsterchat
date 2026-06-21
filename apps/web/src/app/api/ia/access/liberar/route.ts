import { NextRequest, NextResponse } from 'next/server';
import { liberarAcesso, isPlatformEnabled } from '@/lib/api/integrations/platform-access';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Reprocessa a liberação de acesso do aluno (replay do webhook na edge function).
 * Ação do atendente — aceita email ou contactId.
 */
export async function POST(request: NextRequest) {
  try {
    if (!isPlatformEnabled()) {
      return NextResponse.json({ ok: false, message: 'Integração da plataforma não configurada.' }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    let email = typeof body.email === 'string' ? body.email.trim() : '';
    const contactId = typeof body.contactId === 'string' ? body.contactId : '';

    if (!email && contactId) {
      const { data } = await supabaseAdmin.from('contacts').select('email').eq('id', contactId).maybeSingle();
      if (data?.email) email = data.email;
    }
    if (!email) {
      return NextResponse.json({ ok: false, message: 'Sem e-mail da compra para liberar.' }, { status: 400 });
    }

    const result = await liberarAcesso({ email });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[API ia/access/liberar]', err);
    return NextResponse.json({ ok: false, message: 'Falha ao liberar.' }, { status: 500 });
  }
}
