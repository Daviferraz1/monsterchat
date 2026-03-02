import { NextRequest, NextResponse } from 'next/server';
import { createLeadTracking, createLeadTrackingByRef } from '@/lib/api/services/lead-tracking';

/**
 * POST /api/lead-tracking
 * Dois fluxos:
 * 1) Redirecionamento direto (sem formulário): body sem phone, com redirect_wa e UTM.
 *    Cria registro por ref, retorna redirectUrl com mensagem pré-preenchida contendo o ref.
 * 2) Com formulário: body com phone e UTM; redirect_wa opcional.
 * Body: { phone?, direct?, utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?, redirect_wa? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const redirectWa = typeof body.redirect_wa === 'string' ? body.redirect_wa.trim().replace(/\D/g, '') : '';
    const direct = !!body.direct;

    const utm = {
      utm_source: body.utm_source,
      utm_medium: body.utm_medium,
      utm_campaign: body.utm_campaign,
      utm_content: body.utm_content,
      utm_term: body.utm_term,
    };

    let redirectUrl: string | null = null;

    if (direct || !phone) {
      // Redirecionamento direto: gera ref, salva UTM e redireciona para wa.me com mensagem personalizada
      if (!redirectWa) {
        return NextResponse.json(
          { error: 'Para redirecionamento direto informe redirect_wa na URL ou NEXT_PUBLIC_WHATSAPP_REDIRECT_NUMBER.' },
          { status: 400 }
        );
      }
      const ref = await createLeadTrackingByRef(utm);
      const withCountry = redirectWa.startsWith('55') ? redirectWa : `55${redirectWa}`;
      const message =
        typeof body.message_template === 'string' && body.message_template.trim()
          ? body.message_template.trim()
          : 'Olá! 👋 Quero conversar.';
      const prefillText = `${message} ${ref}`;
      redirectUrl = `https://wa.me/${withCountry}?text=${encodeURIComponent(prefillText)}`;
      return NextResponse.json({ ok: true, redirectUrl, ref });
    }

    // Fluxo com formulário (phone obrigatório)
    await createLeadTracking(phone, utm);
    if (redirectWa) {
      const withCountry = redirectWa.startsWith('55') ? redirectWa : `55${redirectWa}`;
      redirectUrl = `https://wa.me/${withCountry}`;
    }

    return NextResponse.json({ ok: true, redirectUrl });
  } catch (err) {
    console.error('[lead-tracking]', err);
    return NextResponse.json({ error: 'Erro ao registrar lead' }, { status: 500 });
  }
}
