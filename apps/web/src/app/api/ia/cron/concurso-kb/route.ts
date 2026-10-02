import { NextRequest, NextResponse } from 'next/server';
import { syncConcursoKb } from '@/lib/api/ia/concurso-kb';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Sync diário da base de concursos (blog + editais da plataforma) e dos
 * embeddings pendentes — inclusive fichas e trechos enviados pelo concurso-monitor.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await syncConcursoKb({ maxEmbedMs: 220_000 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[API ia/cron/concurso-kb]', err);
    return NextResponse.json({ error: 'Falha no sync da base de concursos' }, { status: 500 });
  }
}
