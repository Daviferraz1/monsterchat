import { NextResponse } from 'next/server';
import axios from 'axios';
import { supabaseAdmin } from '@/lib/api/supabase';
import { isSupabasePlaceholder } from '@/lib/api/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRAPH = 'https://graph.facebook.com/v23.0';
const IG_GRAPH = 'https://graph.instagram.com/v21.0';

type Check = { name: string; ok: boolean; detail: string };

const get = async (url: string, config: Parameters<typeof axios.get>[1]) =>
  axios.get(url, { timeout: 10000, validateStatus: () => true, ...config });

/**
 * GET /api/diagnostic/instagram
 *
 * Diagnóstico do ENVIO de mensagens pelo Instagram. Testa exatamente o caminho que
 * `sendInstagramText` usa, sem enviar mensagem:
 *
 * - Token `IGA...` (Instagram Login) → graph.instagram.com/me
 * - Token `EAA...` (Facebook) → deriva o Page Access Token e lê as conversas do Instagram
 *   da Página (`GET /{page-id}/conversations?platform=instagram`), que exige a mesma
 *   permissão do envio (`instagram_manage_messages`).
 *
 * A versão antiga deste diagnóstico testava só `GET /{page-id}` — isso passa com token de
 * usuário do sistema, que NÃO consegue enviar. Por isso dava "ok" com o envio quebrado.
 */
export async function GET() {
  if (isSupabasePlaceholder()) {
    return NextResponse.json({ error: 'Supabase não configurado.', ok: false }, { status: 503 });
  }

  try {
    const { data: channels, error: chError } = await supabaseAdmin
      .from('channels')
      .select('id, name, type, external_id, business_account_id, is_active, access_token, created_at')
      .eq('type', 'instagram')
      .order('created_at', { ascending: false });

    if (chError) {
      return NextResponse.json(
        { error: 'Erro ao listar canais.', detail: chError.message, ok: false },
        { status: 500 }
      );
    }

    const list = (channels || []) as Array<{
      id: string;
      name: string;
      external_id: string | null;
      business_account_id: string | null;
      is_active: boolean;
      access_token: string | null;
      created_at: string;
    }>;

    const diagnostics = [];

    for (const ch of list) {
      const extId = (ch.external_id ?? '').trim();
      const bizId = (ch.business_account_id ?? '').trim();
      const token = (ch.access_token ?? '').trim();
      const checks: Check[] = [];
      let canSend = false;
      let tokenKind: 'instagram-login' | 'facebook' | 'desconhecido' = 'desconhecido';
      let fix: string | null = null;

      if (!token) {
        checks.push({ name: 'token', ok: false, detail: 'Token vazio no canal.' });
        fix = 'Em Configurações → Canais, cole o token do canal Instagram.';
        diagnostics.push({ channelId: ch.id, channelName: ch.name, isActive: ch.is_active, externalId: extId || null, businessAccountId: bizId || null, tokenKind, canSend, checks, fix });
        continue;
      }

      tokenKind = /^IGA/i.test(token) ? 'instagram-login' : 'facebook';
      checks.push({
        name: 'tipo do token',
        ok: true,
        detail:
          tokenKind === 'instagram-login'
            ? 'Token do Instagram Login (IGA...) → envio por graph.instagram.com/me/messages.'
            : 'Token do Facebook (EAA...) → envio por graph.facebook.com/{page-id}/messages com Page Access Token.',
      });

      if (tokenKind === 'instagram-login') {
        const me = await get(`${IG_GRAPH}/me`, {
          params: { fields: 'user_id,username' },
          headers: { Authorization: `Bearer ${token}` },
        });
        const ok = me.status === 200 && !!me.data?.user_id;
        checks.push({
          name: 'token válido no Instagram Login',
          ok,
          detail: ok ? `Conta: @${me.data.username} (${me.data.user_id})` : me.data?.error?.message ?? `HTTP ${me.status}`,
        });
        if (ok && bizId && String(me.data.user_id) !== bizId) {
          checks.push({
            name: 'token pertence à conta certa',
            ok: false,
            detail: `O token é da conta ${me.data.user_id}, mas o webhook entrega mensagens da conta ${bizId}. Você recebe de uma conta e tenta responder por outra.`,
          });
          fix = 'Gere o token do Instagram Login da conta que recebe as mensagens.';
        } else if (ok) {
          canSend = true;
        } else {
          fix = 'Refaça o Instagram Login e cole o token novo (IGA...) em Configurações → Canais.';
        }
      } else {
        // Token do Facebook: precisa do Page ID e de um Page Access Token.
        const dbg = await get(`${GRAPH}/debug_token`, { params: { input_token: token, access_token: token } });
        const d = dbg.data?.data;
        const scopes: string[] = d?.scopes ?? [];
        checks.push({
          name: 'token válido no Facebook',
          ok: !!d?.is_valid,
          detail: d?.is_valid
            ? `tipo=${d.type}, expira=${d.expires_at === 0 ? 'nunca' : new Date(d.expires_at * 1000).toISOString()}`
            : dbg.data?.error?.message ?? `HTTP ${dbg.status}`,
        });
        checks.push({
          name: 'permissão instagram_manage_messages',
          ok: scopes.includes('instagram_manage_messages'),
          detail: scopes.includes('instagram_manage_messages')
            ? 'presente'
            : `ausente. Escopos: ${scopes.join(', ') || '(nenhum)'}`,
        });

        if (!extId) {
          checks.push({ name: 'External ID (Page ID)', ok: false, detail: 'Vazio. Com token do Facebook o envio usa POST /{page-id}/messages.' });
          fix = 'Preencha "External ID" com o ID da Página do Facebook vinculada ao Instagram.';
        } else {
          const page = await get(`${GRAPH}/${extId}`, {
            params: { fields: 'id,name,instagram_business_account{id,username}' },
            headers: { Authorization: `Bearer ${token}` },
          });
          const linkedIg = page.data?.instagram_business_account?.id;
          checks.push({
            name: 'Página existe e está vinculada ao Instagram',
            ok: page.status === 200 && !!linkedIg,
            detail:
              page.status === 200
                ? linkedIg
                  ? `Página "${page.data.name}" ↔ @${page.data.instagram_business_account.username} (${linkedIg})`
                  : 'A Página não tem conta Instagram vinculada.'
                : page.data?.error?.message ?? `HTTP ${page.status}`,
          });
          if (linkedIg && bizId && linkedIg !== bizId) {
            checks.push({
              name: 'Página é a da conta que recebe',
              ok: false,
              detail: `A Página está ligada à conta ${linkedIg}, mas o webhook entrega mensagens da conta ${bizId}.`,
            });
            fix = 'Use no External ID o ID da Página vinculada à conta Instagram que recebe as mensagens.';
          }

          // Deriva o Page Access Token — é o que o envio realmente usa.
          const pageTokenRes = await get(`${GRAPH}/${extId}`, {
            params: { fields: 'access_token', access_token: token },
          });
          const pageToken = pageTokenRes.data?.access_token;
          checks.push({
            name: 'Page Access Token disponível',
            ok: !!pageToken,
            detail: pageToken
              ? 'Derivado do token do canal (o app faz isso automaticamente no envio).'
              : pageTokenRes.data?.error?.message ?? 'Não foi possível derivar. O token precisa de pages_show_list e acesso a essa Página.',
          });

          if (pageToken) {
            // Probe read-only com a MESMA permissão do envio.
            const conv = await get(`${GRAPH}/${extId}/conversations`, {
              params: { platform: 'instagram', fields: 'id,updated_time', limit: 1 },
              headers: { Authorization: `Bearer ${pageToken}` },
            });
            const ok = conv.status === 200;
            checks.push({
              name: 'acesso às mensagens do Instagram (mesma permissão do envio)',
              ok,
              detail: ok
                ? `OK — ${conv.data?.data?.length ?? 0} conversa(s) visível(is).`
                : conv.data?.error?.message ?? `HTTP ${conv.status}`,
            });
            canSend = ok;
            if (!ok && !fix) {
              fix = 'No app do Instagram: Configurações → Mensagens → Ferramentas conectadas → ative "Permitir acesso às mensagens". Confira também a permissão instagram_manage_messages no app da Meta.';
            }
          }
        }
      }

      diagnostics.push({
        channelId: ch.id,
        channelName: ch.name,
        isActive: ch.is_active,
        externalId: extId || null,
        businessAccountId: bizId || null,
        tokenKind,
        canSend,
        checks,
        fix,
      });
    }

    return NextResponse.json({
      ok: true,
      summary: {
        totalChannels: list.length,
        active: list.filter((c) => c.is_active).length,
        podemEnviar: diagnostics.filter((d) => d.canSend).length,
      },
      channels: diagnostics,
      notas: [
        'canSend=true significa que token, IDs e permissões estão certos. Ainda valem as regras da Meta: só dá para responder quem te escreveu nas últimas 24h, e em app no modo Desenvolvimento o destinatário precisa ser testador.',
        'ATENÇÃO: este diagnóstico não enxerga o nível de acesso do app (Padrão x Avançado) — não existe endpoint para consultar isso com o token do canal. Com Acesso Padrão em instagram_manage_messages, o envio funciona para quem tem função no app e falha para cliente real com "(#200) ... acesso avançado". Se o envio funciona para a sua conta e falha para clientes, é isso: peça Acesso Avançado em Análise do app → Permissões e recursos.',
        'Nunca misture os dois caminhos: token IGA... só funciona em graph.instagram.com; token EAA... só em graph.facebook.com/{page-id}/messages.',
      ],
    });
  } catch (err: unknown) {
    console.error('[diagnostic/instagram]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro no diagnóstico.', ok: false },
      { status: 500 }
    );
  }
}
