import { NextRequest, NextResponse } from 'next/server';
import { listResendEmails } from '@/lib/api/integrations/resend';

export const dynamic = 'force-dynamic';

/** GET: lista e-mails enviados pelo Resend (paginação: after=id do último para e-mails mais antigos) */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const after = searchParams.get('after') ?? undefined;
    const { emails, hasMore, configured } = await listResendEmails({ limit, after });
    return NextResponse.json({ emails, hasMore, configured });
  } catch (err) {
    console.error('[API resend/emails]', err);
    return NextResponse.json({ error: 'Falha ao listar e-mails', emails: [], hasMore: false, configured: false }, { status: 500 });
  }
}
