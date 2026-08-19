import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext } from '@/lib/api/team';

export const dynamic = 'force-dynamic';

async function requireManager() {
  const ctx = await getTeamContext();
  if (!ctx) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  if (!ctx.isManager) {
    return { error: NextResponse.json({ error: 'Só gestor ou admin pode gerenciar departamentos' }, { status: 403 }) };
  }
  return { ctx };
}

/** Departamentos com contagem de gente e de conversas na fila. */
export async function GET() {
  const guard = await requireManager();
  if (guard.error) return guard.error;

  try {
    const { data: departments, error } = await supabaseAdmin
      .from('sectors')
      .select('id, name, description, color, active, sort_order, sla_first_response_minutes, sla_resolution_minutes')
      .order('sort_order')
      .order('name');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const [{ data: links }, { data: conversations }] = await Promise.all([
      supabaseAdmin.from('team_member_departments').select('department_id'),
      supabaseAdmin.from('conversations').select('department_id').not('department_id', 'is', null),
    ]);

    const countBy = (rows: { department_id: string | null }[] | null) => {
      const map = new Map<string, number>();
      for (const row of rows ?? []) {
        if (!row.department_id) continue;
        map.set(row.department_id, (map.get(row.department_id) ?? 0) + 1);
      }
      return map;
    };
    const memberCount = countBy(links as { department_id: string | null }[] | null);
    const conversationCount = countBy(conversations);

    return NextResponse.json({
      departments: (departments ?? []).map((d) => ({
        ...d,
        member_count: memberCount.get(d.id) ?? 0,
        conversation_count: conversationCount.get(d.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error('[API team/departments] GET', err);
    return NextResponse.json({ error: 'Falha ao listar departamentos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireManager();
  if (guard.error) return guard.error;

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('sectors')
      .insert({
        name,
        description: typeof body.description === 'string' ? body.description.trim() || null : null,
        color: typeof body.color === 'string' && body.color ? body.color : '#8b5cf6',
        sla_first_response_minutes: Number.isFinite(body.slaFirstResponseMinutes)
          ? Number(body.slaFirstResponseMinutes)
          : null,
        sort_order: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 100,
      })
      .select('id')
      .single();
    if (error) {
      const conflict = error.code === '23505';
      return NextResponse.json(
        { error: conflict ? 'Já existe um departamento com esse nome' : error.message },
        { status: conflict ? 409 : 500 }
      );
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    console.error('[API team/departments] POST', err);
    return NextResponse.json({ error: 'Falha ao criar departamento' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireManager();
  if (guard.error) return guard.error;

  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === 'string' ? body.id : '';
    if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.description === 'string') patch.description = body.description.trim() || null;
    if (typeof body.color === 'string' && body.color) patch.color = body.color;
    if (typeof body.active === 'boolean') patch.active = body.active;
    if (body.slaFirstResponseMinutes === null || Number.isFinite(body.slaFirstResponseMinutes)) {
      patch.sla_first_response_minutes =
        body.slaFirstResponseMinutes === null ? null : Number(body.slaFirstResponseMinutes);
    }
    if (Number.isFinite(body.sortOrder)) patch.sort_order = Number(body.sortOrder);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'nada para atualizar' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('sectors').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API team/departments] PATCH', err);
    return NextResponse.json({ error: 'Falha ao atualizar departamento' }, { status: 500 });
  }
}
