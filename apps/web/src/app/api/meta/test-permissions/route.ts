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
 * - Instagram (se houver canal ativo): GET me?fields=id,name,instagram_business_account (pages + instagram_basic)
 */
export async function GET() {
  try {
    let accessToken: string | null = apiEnv.WHATSAPP_ACCESS_TOKEN || null;
    let wabaId: string | null = apiEnv.WHATSAPP_WABA_ID || null;
    let instagramToken: string | null = null;

    if (!isSupabasePlaceholder()) {
      const { data: whatsappChannels } = await supabaseAdmin
        .from('channels')
        .select('access_token, business_account_id')
        .eq('type', 'whatsapp')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      if (whatsappChannels?.[0]) {
        accessToken = accessToken || whatsappChannels[0].access_token || null;
        wabaId = wabaId || whatsappChannels[0].business_account_id || null;
      }
      const { data: igChannels } = await supabaseAdmin
        .from('channels')
        .select('access_token')
        .eq('type', 'instagram')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      if (igChannels?.[0]?.access_token) {
        instagramToken = igChannels[0].access_token;
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

    // Timeout generoso para a Graph API da Meta (pode ser lenta)
    const META_API_TIMEOUT_MS = 30000;

    // 1) business_management — GET me/businesses
    try {
      const res = await axios.get(`${GRAPH_BASE}/me/businesses`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: META_API_TIMEOUT_MS,
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
          timeout: META_API_TIMEOUT_MS,
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

    // 3) Instagram — pages_read_engagement, instagram_basic / instagram_business_basic (token do canal = Page token; me = página)
    if (instagramToken && instagramToken.trim() !== '') {
      try {
        const res = await axios.get(`${GRAPH_BASE}/me`, {
          params: { fields: 'id,name,instagram_business_account' },
          headers: { Authorization: `Bearer ${instagramToken}` },
          timeout: META_API_TIMEOUT_MS,
          validateStatus: () => true,
        });
        if (res.status === 200 && res.data?.id) {
          results.instagram_pages_basic = {
            ok: true,
            message: 'Chamada registrada (me?fields=id,name,instagram_business_account) — pages + instagram_basic',
          };
        } else {
          results.instagram_pages_basic = {
            ok: false,
            message: res.data?.error?.message || `HTTP ${res.status}`,
            detail: res.data?.error || { status: res.status },
          };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.instagram_pages_basic = { ok: false, message: msg, detail: undefined };
      }
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
