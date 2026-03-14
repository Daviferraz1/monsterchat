import { NextRequest, NextResponse } from 'next/server';
import {
  isAutopilotEnabled,
  setAutopilotEnabled,
  isSuggestionEnabled,
  setSuggestionEnabled,
  isSuggestionAIEnabled,
  setSuggestionAIEnabled,
  isLearnFromFeedbackUseAi,
  setLearnFromFeedbackUseAi,
} from '@/lib/api/ia/autopilot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [enabled, suggestionEnabled, suggestionAiEnabled, learnFromFeedbackUseAi] = await Promise.all([
      isAutopilotEnabled(),
      isSuggestionEnabled(),
      isSuggestionAIEnabled(),
      isLearnFromFeedbackUseAi(),
    ]);
    return NextResponse.json({ enabled, suggestionEnabled, suggestionAiEnabled, learnFromFeedbackUseAi });
  } catch (err) {
    console.error('[API ia/autopilot GET]', err);
    return NextResponse.json({ enabled: false, suggestionEnabled: false, suggestionAiEnabled: true, learnFromFeedbackUseAi: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.enabled === 'boolean') {
      await setAutopilotEnabled(body.enabled);
    }
    if (typeof body.suggestionEnabled === 'boolean') {
      await setSuggestionEnabled(body.suggestionEnabled);
    }
    if (typeof body.suggestionAiEnabled === 'boolean') {
      await setSuggestionAIEnabled(body.suggestionAiEnabled);
    }
    if (typeof body.learnFromFeedbackUseAi === 'boolean') {
      await setLearnFromFeedbackUseAi(body.learnFromFeedbackUseAi);
    }
    const [enabled, suggestionEnabled, suggestionAiEnabled, learnFromFeedbackUseAi] = await Promise.all([
      isAutopilotEnabled(),
      isSuggestionEnabled(),
      isSuggestionAIEnabled(),
      isLearnFromFeedbackUseAi(),
    ]);
    return NextResponse.json({ enabled, suggestionEnabled, suggestionAiEnabled, learnFromFeedbackUseAi });
  } catch (err) {
    console.error('[API ia/autopilot POST]', err);
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
  }
}
