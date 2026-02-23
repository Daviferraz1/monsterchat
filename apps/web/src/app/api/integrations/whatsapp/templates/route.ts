import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { sanitizeTokenForHeader } from '@/lib/api/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Estrutura simplificada de um template da API Meta.
 * Ref: https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates/
 */
interface WhatsAppTemplateComponent {
  type: string;
  text?: string;
  format?: string;
  example?: { body_text?: string[][] };
}

interface WhatsAppTemplateNode {
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: WhatsAppTemplateComponent[];
}

interface MetaTemplatesResponse {
  data?: WhatsAppTemplateNode[];
  paging?: { next?: string };
}

/**
 * GET /api/integrations/whatsapp/templates
 *
 * Lista os templates de mensagem do WhatsApp (Meta Graph API) usando o primeiro
 * canal WhatsApp ativo que tenha business_account_id (WABA).
 * Requer permissão whatsapp_business_management no token.
 */
export async function GET() {
  try {
    const { data: channels, error } = await supabaseAdmin
      .from('channels')
      .select('id, access_token, business_account_id')
      .eq('type', 'whatsapp')
      .eq('is_active', true)
      .not('business_account_id', 'is', null)
      .limit(1);

    if (error || !channels?.length) {
      return NextResponse.json(
        { error: 'Nenhum canal WhatsApp configurado com WABA.', templates: [] },
        { status: 200 }
      );
    }

    const channel = channels[0];
    const wabaId = channel.business_account_id?.trim();
    const token = sanitizeTokenForHeader(channel.access_token);

    if (!wabaId || !token) {
      return NextResponse.json(
        { error: 'Canal sem WABA ou token.', templates: [] },
        { status: 200 }
      );
    }

    const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,language,status,category,components`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const json = (await res.json()) as MetaTemplatesResponse & { error?: { message?: string } };

    if (!res.ok) {
      const msg = json?.error?.message ?? res.statusText;
      console.error('[WhatsApp templates] Meta API error:', res.status, msg);
      return NextResponse.json(
        { error: msg || 'Erro ao buscar templates.', templates: [] },
        { status: 200 }
      );
    }

    const raw = (json.data ?? []) as WhatsAppTemplateNode[];
    const templates = raw
      .filter((t) => t.status === 'APPROVED')
      .map((t) => {
        let bodyText = '';
        const bodyComp = t.components?.find((c) => c.type === 'BODY');
        if (bodyComp?.text) {
          bodyText = bodyComp.text;
        }
        const bodyPreview = bodyText ? bodyText.replace(/\{\{\d+\}\}/g, '___') : undefined;
        return {
          name: t.name,
          language: t.language,
          category: t.category ?? undefined,
          body_preview: bodyPreview,
          body_text: bodyText || undefined,
        };
      });

    return NextResponse.json({ templates });
  } catch (err) {
    console.error('[WhatsApp templates]', err);
    return NextResponse.json(
      { error: 'Erro ao listar templates.', templates: [] },
      { status: 200 }
    );
  }
}
