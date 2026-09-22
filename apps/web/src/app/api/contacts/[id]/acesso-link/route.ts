import { NextRequest, NextResponse } from 'next/server';
import { enviarLinkNaConversa } from '@/lib/api/services/acesso-direto';
import { isPlatformEnabled } from '@/lib/api/integrations/platform-access';
import { getTeamContext } from '@/lib/api/team';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/contacts/:id/acesso-link — o atendente manda o link de acesso
 * direto na conversa. Corpo: { conversationId? }.
 *
 * Sessão obrigatória (middleware). Quem mandou fica registrado na mensagem e
 * em `acesso_links.criado_por`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isPlatformEnabled()) {
      return NextResponse.json({ ok: false, message: 'Integração da plataforma não configurada.' }, { status: 400 });
    }
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { conversationId?: string };
    const agente = await getTeamContext();
    const resultado = await enviarLinkNaConversa({
      contactId: id,
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
      criadoPor: agente?.userId ?? null,
      origem: 'atendente',
    });
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 400 });
  } catch (err) {
    console.error('[API contacts/:id/acesso-link]', err);
    return NextResponse.json({ ok: false, message: 'Falha ao enviar o link.' }, { status: 500 });
  }
}
