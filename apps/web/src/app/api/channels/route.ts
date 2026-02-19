import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/channels - Lista todos os canais
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('channels')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching channels:', error);
      return NextResponse.json(
        { error: 'Failed to fetch channels' },
        { status: 500 }
      );
    }

    return NextResponse.json(data || []);
  } catch (error: unknown) {
    console.error('Error in channels GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/channels - Cria um novo canal (WhatsApp ou Instagram)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type,
      name,
      external_id,
      business_account_id,
      access_token,
      webhook_verify_token,
      is_active = true,
    } = body;

    if (!type || !name || !external_id || !access_token) {
      return NextResponse.json(
        { error: 'type, name, external_id e access_token são obrigatórios' },
        { status: 400 }
      );
    }

    if (!['whatsapp', 'instagram'].includes(type)) {
      return NextResponse.json(
        { error: 'type deve ser "whatsapp" ou "instagram"' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('channels')
      .insert({
        type,
        name,
        external_id,
        business_account_id: business_account_id || null,
        access_token,
        webhook_verify_token: webhook_verify_token || null,
        is_active: !!is_active,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating channel:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to create channel' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('Error in channels POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
