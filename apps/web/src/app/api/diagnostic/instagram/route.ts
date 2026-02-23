import { NextResponse } from 'next/server';
import axios from 'axios';
import { supabaseAdmin } from '@/lib/api/supabase';
import { isSupabasePlaceholder } from '@/lib/api/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRAPH = 'https://graph.facebook.com/v23.0';

/**
 * GET /api/diagnostic/instagram
 *
 * Diagnóstico do envio de mensagens pelo Instagram: lista canais, verifica
 * Page ID vs Instagram ID e testa o token com a Graph API (sem enviar mensagem).
 */
export async function GET() {
  if (isSupabasePlaceholder()) {
    return NextResponse.json(
      { error: 'Supabase não configurado.', ok: false },
      { status: 503 }
    );
  }

  try {
    const { data: channels, error: chError } = await supabaseAdmin
      .from('channels')
      .select('id, name, type, external_id, business_account_id, is_active, created_at')
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
      type: string;
      external_id: string | null;
      business_account_id: string | null;
      is_active: boolean;
      created_at: string;
    }>;

    const diagnostics: Array<{
      channelId: string;
      channelName: string;
      externalId: string | null;
      businessAccountId: string | null;
      isActive: boolean;
      /** Page ID é necessário para ENVIAR; Instagram ID (recipient.id) é necessário para o webhook achar o canal */
      hint: string;
      tokenTest: 'ok' | 'fail' | 'skipped';
      tokenError?: string;
      pageName?: string;
    }> = [];

    for (const ch of list) {
      const extId = ch.external_id ?? '';
      const bizId = ch.business_account_id ?? '';
      let hint = '';
      if (!extId) {
        hint = 'External ID (Page ID) está vazio. Em Configurações → Canais, preencha "ID da Página do Facebook" para poder enviar mensagens.';
      } else if (extId.length < 10) {
        hint = 'External ID parece curto. Para enviar, use o ID da Página do Facebook (não o da conta do Instagram).';
      } else {
        hint = `Page ID (external_id) = ${extId}. Use para enviar.`;
        if (bizId) {
          hint += ` Instagram ID (business_account_id) = ${bizId} — o webhook usa esse valor (recipient.id) para encontrar o canal.`;
        } else {
          hint += ' business_account_id vazio: o webhook pode não encontrar o canal ao receber (recipient.id costuma ser o ID da conta Instagram, ex: 17841403342667626).';
        }
      }

      let tokenTest: 'ok' | 'fail' | 'skipped' = 'skipped';
      let tokenError: string | undefined;
      let pageName: string | undefined;

      if (ch.is_active && extId) {
        const { data: fullChannel } = await supabaseAdmin
          .from('channels')
          .select('access_token')
          .eq('id', ch.id)
          .single();
        const token = (fullChannel as { access_token?: string } | null)?.access_token;
        if (token && token.trim()) {
          try {
            const res = await axios.get(`${GRAPH}/${extId}`, {
              params: { fields: 'id,name', access_token: token },
              timeout: 10000,
              validateStatus: () => true,
            });
            if (res.status === 200 && res.data?.id) {
              tokenTest = 'ok';
              pageName = res.data.name;
            } else {
              tokenTest = 'fail';
              tokenError = res.data?.error?.message ?? `HTTP ${res.status}`;
            }
          } catch (err: unknown) {
            tokenTest = 'fail';
            tokenError = err instanceof Error ? err.message : String(err);
          }
        } else {
          tokenError = 'Token vazio no banco. Atualize o token em Configurações → Canais.';
          tokenTest = 'fail';
        }
      }

      diagnostics.push({
        channelId: ch.id,
        channelName: ch.name,
        externalId: ch.external_id,
        businessAccountId: ch.business_account_id,
        isActive: ch.is_active,
        hint,
        tokenTest,
        tokenError,
        pageName,
      });
    }

    const summary = {
      totalChannels: list.length,
      active: list.filter((c) => c.is_active).length,
      withPageId: list.filter((c) => c.external_id && c.external_id.trim()).length,
      withBusinessAccountId: list.filter((c) => c.business_account_id && c.business_account_id.trim()).length,
    };

    return NextResponse.json({
      ok: true,
      summary,
      channels: diagnostics,
      checklist: [
        '1. Canal ativo com External ID = Page ID (Facebook) e business_account_id = ID da conta Instagram (recipient.id do webhook).',
        '2. Token = Page Access Token da Página, com permissões instagram_manage_messages e instagram_basic.',
        '3. Janela de 24h: só é possível enviar para quem te enviou mensagem nas últimas 24 horas.',
        '4. App em desenvolvimento: o destinatário precisa ser testador do app no painel da Meta.',
        '5. No Instagram (app): Configurações → Mensagens → Ferramentas conectadas → Permitir acesso às mensagens.',
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
