import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext } from '@/lib/api/team';
import { METRIC_BY_KEY, type GoalPeriod, type MetricKey } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const PERIODOS: GoalPeriod[] = ['daily', 'weekly', 'monthly'];

/** Metas por pessoa. Só gestor e admin escrevem; cada um lê a sua. */
export async function GET() {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  let query = supabaseAdmin
    .from('team_goals')
    .select('id, user_id, metric, period, target')
    .eq('active', true);
  if (!ctx.isManager) query = query.eq('user_id', ctx.userId);

  const { data, error } = await query;
  if (error) {
    console.error('[API goals] GET', error.message);
    return NextResponse.json({ error: 'Falha ao carregar as metas' }, { status: 500 });
  }
  return NextResponse.json({ goals: data ?? [] });
}

export async function PUT(request: Request) {
  const ctx = await getTeamContext();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!ctx.isManager) {
    return NextResponse.json({ error: 'Só gestor define meta' }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      userId?: string;
      metric?: MetricKey;
      period?: GoalPeriod;
      target?: number | null;
    };

    const { userId, metric, period = 'monthly', target } = body;
    if (!userId || !metric || !METRIC_BY_KEY[metric]) {
      return NextResponse.json({ error: 'Informe a pessoa e a métrica' }, { status: 400 });
    }
    if (!PERIODOS.includes(period)) {
      return NextResponse.json({ error: 'Período inválido' }, { status: 400 });
    }

    // target nulo ou zero = tirar a meta. Desativa em vez de apagar para não
    // perder o histórico de o que já foi combinado com a pessoa.
    if (target == null || target <= 0) {
      const { error } = await supabaseAdmin
        .from('team_goals')
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('metric', metric)
        .eq('period', period)
        .eq('active', true);
      if (error) throw error;
      return NextResponse.json({ ok: true, removed: true });
    }

    const { data: existente } = await supabaseAdmin
      .from('team_goals')
      .select('id')
      .eq('user_id', userId)
      .eq('metric', metric)
      .eq('period', period)
      .eq('active', true)
      .maybeSingle();

    if (existente) {
      const { data, error } = await supabaseAdmin
        .from('team_goals')
        .update({ target, updated_at: new Date().toISOString() })
        .eq('id', existente.id)
        .select('id, user_id, metric, period, target')
        .single();
      if (error) throw error;
      return NextResponse.json({ goal: data });
    }

    const { data, error } = await supabaseAdmin
      .from('team_goals')
      .insert({ user_id: userId, metric, period, target, created_by: ctx.userId })
      .select('id, user_id, metric, period, target')
      .single();
    if (error) throw error;
    return NextResponse.json({ goal: data });
  } catch (err) {
    console.error('[API goals] PUT', err);
    return NextResponse.json({ error: 'Falha ao salvar a meta' }, { status: 500 });
  }
}
