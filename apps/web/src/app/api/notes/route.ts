import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { canSeeConversation, getTeamContext, type TeamContext } from '@/lib/api/team';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Mesma regra da RLS da 043. */
function canSeeTask(
  ctx: TeamContext,
  task: { assigned_to?: string | null; created_by?: string | null; department_id?: string | null }
): boolean {
  if (ctx.scope === 'all') return true;
  if (task.assigned_to === ctx.userId || task.created_by === ctx.userId) return true;
  if (ctx.scope === 'assigned') return false;
  if (!task.department_id) return true;
  return ctx.departmentIds.includes(task.department_id);
}

/**
 * POST /api/notes
 * body: { conversationId? | taskId?, body?, mediaPath?, mediaMimeType?, mediaFilename?, mediaSize? }
 *
 * Recado interno da equipe — vale tanto para uma conversa quanto para uma tarefa.
 * Uma rota só porque a regra é a mesma: confere o acesso ao item e carimba o autor
 * a partir da SESSÃO, nunca do corpo (senão daria para escrever no nome de outro).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const payload = await request.json().catch(() => ({}));
    const conversationId =
      typeof payload.conversationId === 'string' && payload.conversationId ? payload.conversationId : null;
    const taskId = typeof payload.taskId === 'string' && payload.taskId ? payload.taskId : null;

    if (!conversationId === !taskId) {
      return NextResponse.json(
        { error: 'Informe exatamente um alvo: conversationId ou taskId' },
        { status: 400 }
      );
    }

    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    const mediaPath =
      typeof payload.mediaPath === 'string' && payload.mediaPath ? payload.mediaPath : null;
    if (!body && !mediaPath) {
      return NextResponse.json({ error: 'Escreva algo ou anexe um arquivo' }, { status: 400 });
    }

    if (conversationId) {
      const { data: conversation } = await supabaseAdmin
        .from('conversations')
        .select('id, assigned_to, department_id')
        .eq('id', conversationId)
        .maybeSingle();
      if (!conversation) {
        return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });
      }
      if (!canSeeConversation(ctx, conversation)) {
        return NextResponse.json({ error: 'Você não tem acesso a esta conversa' }, { status: 403 });
      }
    } else {
      const { data: task } = await supabaseAdmin
        .from('tasks')
        .select('id, assigned_to, created_by, department_id')
        .eq('id', taskId)
        .maybeSingle();
      if (!task) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
      if (!canSeeTask(ctx, task)) {
        return NextResponse.json({ error: 'Você não tem acesso a esta tarefa' }, { status: 403 });
      }
    }

    const { data: note, error } = await supabaseAdmin
      .from('internal_notes')
      .insert({
        conversation_id: conversationId,
        task_id: taskId,
        author_id: ctx.userId,
        body: body || `[${payload.mediaFilename ?? 'arquivo'}]`,
        media_path: mediaPath,
        media_mime_type: typeof payload.mediaMimeType === 'string' ? payload.mediaMimeType : null,
        media_filename: typeof payload.mediaFilename === 'string' ? payload.mediaFilename : null,
        media_size: Number.isFinite(payload.mediaSize) ? Number(payload.mediaSize) : null,
      })
      .select(
        'id, conversation_id, task_id, author_id, body, media_url, media_path, media_mime_type, media_filename, media_size, created_at'
      )
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    console.error('[API notes] POST', err);
    return NextResponse.json({ error: 'Falha ao salvar o recado' }, { status: 500 });
  }
}
