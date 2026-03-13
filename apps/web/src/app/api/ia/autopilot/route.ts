import { NextRequest, NextResponse } from 'next/server';
import {
  isAutopilotEnabled,
  setAutopilotEnabled,
  isSuggestionEnabled,
  setSuggestionEnabled,
} from '@/lib/api/ia/autopilot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [enabled, suggestionEnabled] = await Promise.all([
      isAutopilotEnabled(),
      isSuggestionEnabled(),
    ]);
    return NextResponse.json({ enabled, suggestionEnabled });
  } catch (err) {
    console.error('[API ia/autopilot GET]', err);
    return NextResponse.json({ enabled: false, suggestionEnabled: false });
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
    const [enabled, suggestionEnabled] = await Promise.all([
      isAutopilotEnabled(),
      isSuggestionEnabled(),
    ]);
    return NextResponse.json({ enabled, suggestionEnabled });
  } catch (err) {
    console.error('[API ia/autopilot POST]', err);
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
  }
}
