import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Endpoint de sugestão passiva desativado: a IA agora responde direto ao aluno no WhatsApp.
 * Retorna resposta vazia para compatibilidade com clientes antigos.
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({
    confidence: 'none',
    suggestion: null,
    category: null,
    alternatives: [],
  });
}
