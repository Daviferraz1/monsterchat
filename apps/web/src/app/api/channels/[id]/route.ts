import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { isSupabasePlaceholder } from '@/lib/api/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PATCH /api/channels/[id] - Atualiza um canal (ex.: access_token quando expira)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isSupabasePlaceholder()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.', code: 'SUPABASE_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: 'Channel id required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.access_token !== undefined) updates.access_token = body.access_token;
    if (body.name !== undefined) updates.name = body.name;
    if (body.is_active !== undefined) updates.is_active = !!body.is_active;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'Envie pelo menos um campo: access_token, name ou is_active' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('channels')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating channel:', error);
      return NextResponse.json(
        { error: error.message || 'Falha ao atualizar canal' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error in channels PATCH:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
