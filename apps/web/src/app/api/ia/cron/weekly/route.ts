import { NextRequest, NextResponse } from 'next/server';
import { weeklyImprovement } from '@/lib/api/ia/weekly';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Vercel Cron envia CRON_SECRET no header
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { improved } = await weeklyImprovement();
    return NextResponse.json({ ok: true, improved });
  } catch (err) {
    console.error('[API ia/cron/weekly]', err);
    return NextResponse.json({ error: 'Erro na melhoria semanal' }, { status: 500 });
  }
}
