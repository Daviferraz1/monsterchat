import { NextResponse } from 'next/server';
import axios from 'axios';
import { apiEnv } from '@/lib/api/env';
import { supabaseAdmin } from '@/lib/api/supabase';
import { isSupabasePlaceholder } from '@/lib/api/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/**
 * GET /api/meta/test-permissions
 *
 * Dispara as chamadas de API que a Meta exige para aprovar permissões no App Review:
 * - business_management: GET me/businesses
 * - whatsapp_business_manage_events: GET {waba_id}/subscribed_apps
 *
 * Usa o token do primeiro canal WhatsApp ativo (ou WHATSAPP_ACCESS_TOKEN) e
 * WABA ID do canal ou WHATSAPP_WABA_ID.
 */
export async function GET() {
  try {
    let accessToken: string | null = apiEnv.WHATSAPP_ACCESS_TOKEN || null;
    let wabaId: string | null = apiEnv.WHATSAPP_WABA_ID || null;

    if (!isSupabasePlaceholder()) {
      const { data: channels } = await supabaseAdmin
        .from('channels')
        .select('access_token, business_account_id')
        .eq('type', 'whatsapp')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      if (channels?.[0]) {
        accessToken = accessToken || channels[0].access_token || null;
        wabaId = wabaId || channels[0].business_account_id || null;
      }
    }

    if (!accessToken || accessToken.trim() === '') {
      return NextResponse.json(
        {
          error: 'Nenhum token disponível',
          hint: 'Configure um canal WhatsApp em Configurações → Canais ou defina WHATSAPP_ACCESS_TOKEN no ambiente.',
          results: {},
        },
        { status: 503 }
      );
    }

    const results: Record<string, { ok: boolean; message?: string; detail?: unknown }> = {};

    // 1) business_management — GET me/businesses
    try {
      const res = await axios.get(`${GRAPH_BASE}/me/businesses`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
        validateStatus: () => true,
      });
      if (res.status === 200 && res.data?.data !== undefined) {
        results.business_management = { ok: true, message: 'Chamada registrada (me/businesses)' };
      } else {
        results.business_management = {
          ok: false,
          message: res.data?.error?.message || `HTTP ${res.status}`,
          detail: res.data?.error || { status: res.status },
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.business_management = { ok: false, message: msg, detail: undefined };
    }

    // 2) whatsapp_business_manage_events — GET {waba_id}/subscribed_apps
    if (wabaId && wabaId.trim() !== '') {
      try {
        const res = await axios.get(`${GRAPH_BASE}/${encodeURIComponent(wabaId.trim())}/subscribed_apps`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 15000,
          validateStatus: () => true,
        });
        if (res.status === 200) {
          results.whatsapp_business_manage_events = {
            ok: true,
            message: 'Chamada registrada (subscribed_apps)',
          };
        } else {
          results.whatsapp_business_manage_events = {
            ok: false,
            message: res.data?.error?.message || `HTTP ${res.status}`,
            detail: res.data?.error || { status: res.status },
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.whatsapp_business_manage_events = { ok: false, message: msg, detail: undefined };
      }
    } else {
      results.whatsapp_business_manage_events = {
        ok: false,
        message: 'WABA ID não configurado',
        detail: 'Defina WHATSAPP_WABA_ID ou preencha "ID da conta Business (WABA ID)" no canal em Configurações → Canais.',
      };
    }

    const allOk = Object.values(results).every((r) => r.ok);
    return NextResponse.json(
      {
        message: allOk
          ? 'Chamadas de teste executadas. Verifique no painel da Meta se as contagens foram atualizadas.'
          : 'Algumas chamadas falharam. Veja results.',
        results,
      },
      { status: allOk ? 200 : 207 }
    );
  } catch (error: unknown) {
    console.error('[meta/test-permissions]', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erro ao executar testes',
        results: {},
      },
      { status: 500 }
    );
  }
}
