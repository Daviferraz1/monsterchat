import { NextRequest, NextResponse } from 'next/server';
import { rodarPiloto } from '@/lib/api/ia/piloto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Cron a cada minuto: piloto automático (ver lib/api/ia/piloto.ts). */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await rodarPiloto()) });
  } catch (err) {
    console.error('[API ia/cron/piloto]', err);
    return NextResponse.json({ error: 'Falha no piloto' }, { status: 500 });
  }
}
