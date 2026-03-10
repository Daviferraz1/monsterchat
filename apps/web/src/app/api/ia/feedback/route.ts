import { NextRequest, NextResponse } from 'next/server';
import { recordSuggestionFeedback } from '@/lib/api/ia/feedback';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    await recordSuggestionFeedback({
      conversationId: body.conversationId,
      knowledgeEntryId: body.knowledgeEntryId,
      suggestedResponse: body.suggestedResponse ?? '',
      confidence: typeof body.confidence === 'number' ? body.confidence : 0,
      wasUsed: body.wasUsed === true,
      wasEdited: body.wasEdited === true,
      editedResponse: body.editedResponse,
      operatorFeedback: body.operatorFeedback,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API ia/feedback]', err);
    return NextResponse.json({ error: 'Erro ao registrar feedback' }, { status: 500 });
  }
}
