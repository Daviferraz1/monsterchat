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
  isLearnOperatorStyleEnabled,
  setLearnOperatorStyleEnabled,
  getAgentModel,
  setAgentModel,
  AGENT_MODEL_OPTIONS,
} from '@/lib/api/ia/autopilot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [enabled, suggestionEnabled, suggestionAiEnabled, learnFromFeedbackUseAi, learnOperatorStyle, agentModel] =
      await Promise.all([
        isAutopilotEnabled(),
        isSuggestionEnabled(),
        isSuggestionAIEnabled(),
        isLearnFromFeedbackUseAi(),
        isLearnOperatorStyleEnabled(),
        getAgentModel(),
      ]);
    return NextResponse.json({
      enabled,
      suggestionEnabled,
      suggestionAiEnabled,
      learnFromFeedbackUseAi,
      learnOperatorStyle,
      agentModel,
      agentModelOptions: AGENT_MODEL_OPTIONS,
    });
  } catch (err) {
    console.error('[API ia/autopilot GET]', err);
    return NextResponse.json({ enabled: false, suggestionEnabled: false, suggestionAiEnabled: true, learnFromFeedbackUseAi: true, learnOperatorStyle: true, agentModel: 'claude-sonnet-4-6', agentModelOptions: AGENT_MODEL_OPTIONS });
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
    if (typeof body.learnOperatorStyle === 'boolean') {
      await setLearnOperatorStyleEnabled(body.learnOperatorStyle);
    }
    if (typeof body.agentModel === 'string' && AGENT_MODEL_OPTIONS.some((o) => o.value === body.agentModel)) {
      await setAgentModel(body.agentModel);
    }
    const [enabled, suggestionEnabled, suggestionAiEnabled, learnFromFeedbackUseAi, learnOperatorStyle, agentModel] =
      await Promise.all([
        isAutopilotEnabled(),
        isSuggestionEnabled(),
        isSuggestionAIEnabled(),
        isLearnFromFeedbackUseAi(),
        isLearnOperatorStyleEnabled(),
        getAgentModel(),
      ]);
    return NextResponse.json({
      enabled,
      suggestionEnabled,
      suggestionAiEnabled,
      learnFromFeedbackUseAi,
      learnOperatorStyle,
      agentModel,
      agentModelOptions: AGENT_MODEL_OPTIONS,
    });
  } catch (err) {
    console.error('[API ia/autopilot POST]', err);
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
  }
}
