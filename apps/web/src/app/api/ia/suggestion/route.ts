import { NextRequest, NextResponse } from 'next/server';
import { isSuggestionEnabled } from '@/lib/api/ia/autopilot';
import { getSuggestion } from '@/lib/api/ia/suggestion';

export const dynamic = 'force-dynamic';

/**
 * Sugestão de resposta com base na base de conhecimento (mensagem do lead).
 * Só retorna sugestão se a opção "Sugestão de mensagem" estiver ativa em Configurações > IA.
 */
export async function POST(request: NextRequest) {
  try {
    const enabled = await isSuggestionEnabled();
    if (!enabled) {
      return NextResponse.json({
        confidence: 'none',
        suggestion: null,
        category: null,
        alternatives: [],
      });
    }
    const body = await request.json().catch(() => ({}));
    const messageBody = typeof body.messageBody === 'string' ? body.messageBody.trim() : '';
    const brand = typeof body.brand === 'string' ? body.brand : undefined;
    const result = await getSuggestion(messageBody, brand);
    return NextResponse.json({
      confidence: result.confidence,
      suggestion: result.suggestion,
      category: result.category,
      alternatives: result.alternatives ?? [],
    });
  } catch (err) {
    console.error('[API ia/suggestion]', err);
    return NextResponse.json({
      confidence: 'none',
      suggestion: null,
      category: null,
      alternatives: [],
    });
  }
}
