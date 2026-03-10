import { NextRequest, NextResponse } from 'next/server';
import { isAutopilotEnabled, setAutopilotEnabled } from '@/lib/api/ia/autopilot';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const enabled = await isAutopilotEnabled();
    return NextResponse.json({ enabled });
  } catch (err) {
    console.error('[API ia/autopilot GET]', err);
    // Se a tabela ia_settings não existir ainda, retorna desligado em vez de 500
    return NextResponse.json({ enabled: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled === true;
    await setAutopilotEnabled(enabled);
    return NextResponse.json({ enabled });
  } catch (err) {
    console.error('[API ia/autopilot POST]', err);
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
  }
}
