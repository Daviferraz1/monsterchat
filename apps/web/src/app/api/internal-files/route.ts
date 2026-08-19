import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { canSeeConversation, getTeamContext, type TeamContext } from '@/lib/api/team';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUCKET = 'internas';
const SIGNED_URL_TTL_SECONDS = 60;

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

/** "<uuid da conversa ou da tarefa>/<arquivo>" — nada de subpasta nem "..". */
const PATH_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/]+$/i;

/**
 * GET /api/internal-files?path=<caminho no bucket privado>
 *
 * Entrega um anexo da conversa interna. O arquivo mora num bucket privado, então
 * a única forma de chegar nele é por aqui — e só depois de confirmar que quem pede
 * enxerga aquela conversa (mesma regra da RLS).
 *
 * A conversa vem do PRÓPRIO caminho, e o formato é validado antes: sem isso, um
 * `path` montado à mão poderia apontar para o arquivo de outra conversa.
 */
export async function GET(request: NextRequest) {
  try {
    const path = request.nextUrl.searchParams.get('path') ?? '';
    if (!PATH_SHAPE.test(path)) {
      return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 });
    }

    const ctx = await getTeamContext();
    if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    // O primeiro segmento é o dono do arquivo: conversa ou tarefa.
    const ownerId = path.split('/')[0];
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('id, assigned_to, department_id')
      .eq('id', ownerId)
      .maybeSingle();

    if (conversation) {
      if (!canSeeConversation(ctx, conversation)) {
        return NextResponse.json({ error: 'Sem acesso a este arquivo' }, { status: 403 });
      }
    } else {
      const { data: task } = await supabaseAdmin
        .from('tasks')
        .select('id, assigned_to, created_by, department_id')
        .eq('id', ownerId)
        .maybeSingle();
      if (!task) return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
      if (!canSeeTask(ctx, task)) {
        return NextResponse.json({ error: 'Sem acesso a este arquivo' }, { status: 403 });
      }
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Arquivo indisponível' }, { status: 404 });
    }

    // 302 para a URL assinada. O link expira em 1 minuto, então não vaza se
    // alguém copiar o endereço da barra depois.
    return NextResponse.redirect(data.signedUrl, {
      status: 302,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    console.error('[API internal-files] GET', err);
    return NextResponse.json({ error: 'Falha ao abrir o arquivo' }, { status: 500 });
  }
}
