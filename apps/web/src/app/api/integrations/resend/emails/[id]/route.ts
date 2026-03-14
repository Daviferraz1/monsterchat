import { NextRequest, NextResponse } from 'next/server';
import { getResendEmail, parseCredentialsFromEmailBody } from '@/lib/api/integrations/resend';

export const dynamic = 'force-dynamic';

/** GET: obtém um e-mail enviado com corpo e credenciais extraídas (login/senha) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = await getResendEmail(id);
    if (!email) {
      return NextResponse.json({ error: 'E-mail não encontrado' }, { status: 404 });
    }
    const credentials = parseCredentialsFromEmailBody(email.html, email.text);
    return NextResponse.json({ email, credentials });
  } catch (err) {
    console.error('[API resend/emails/:id]', err);
    return NextResponse.json({ error: 'Falha ao obter e-mail' }, { status: 500 });
  }
}
