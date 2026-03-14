import { NextRequest, NextResponse } from 'next/server';
import { getCredentialsByEmail } from '@/lib/api/contacts-credentials';

export const dynamic = 'force-dynamic';

/**
 * GET: credenciais de acesso (login/senha) por e-mail do aluno.
 * Query: email= (obrigatório). Usado para sugestão de mensagem e para verificar no Resend.
 * Retorna as credenciais já salvas em contatos que tenham esse e-mail.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email')?.trim()?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: 'Parâmetro email é obrigatório', credentials: [] }, { status: 400 });
    }
    const credentials = await getCredentialsByEmail(email);
    return NextResponse.json({ credentials });
  } catch (err) {
    console.error('[API contacts/credentials-by-email]', err);
    return NextResponse.json({ error: 'Erro ao buscar credenciais', credentials: [] }, { status: 500 });
  }
}
