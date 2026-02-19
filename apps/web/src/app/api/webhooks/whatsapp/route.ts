import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';
import { verifyWebhookSignature } from '@/lib/api/utils';
import { handleWhatsAppWebhook } from '@/lib/api/webhooks/whatsapp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// GET para verificação do webhook (Meta envia hub.mode, hub.verify_token, hub.challenge)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  // Meta exige resposta 200 com o corpo = hub.challenge (texto puro)
  if (mode === 'subscribe' && typeof challenge === 'string' && challenge.length > 0) {
    const expectedToken = apiEnv.META_WEBHOOK_VERIFY_TOKEN;
    if (token === expectedToken) {
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST para receber webhooks
export async function POST(request: NextRequest) {
  try {
    // META_APP_SECRET deve estar configurado (não pode ser placeholder)
    if (!apiEnv.META_APP_SECRET || apiEnv.META_APP_SECRET === 'placeholder-meta-secret') {
      console.error('[WhatsApp Webhook] META_APP_SECRET não configurado no Vercel');
      return NextResponse.json(
        {
          error: 'META_APP_SECRET not configured',
          hint: 'Add META_APP_SECRET in Vercel Environment Variables. Get it from Meta: App Dashboard > Settings > Basic > App Secret',
        },
        { status: 503 }
      );
    }

    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      console.warn('Missing webhook signature');
      return new NextResponse('Missing signature', { status: 401 });
    }

    const rawBody = await request.text();

    // Opcional: pular verificação de assinatura APENAS para diagnóstico (NUNCA em produção real)
    const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VERIFICATION === 'true';
    const isValid = skipVerify || verifyWebhookSignature(rawBody, signature, apiEnv.META_APP_SECRET);

    if (skipVerify) {
      console.warn('[WhatsApp Webhook] ATENÇÃO: Verificação de assinatura desativada (SKIP_WEBHOOK_SIGNATURE_VERIFICATION). Remova essa variável após testar.');
    }

    if (!isValid) {
      console.error(
        '[WhatsApp Webhook] Invalid signature. Check that META_APP_SECRET in Vercel matches exactly the App Secret in Meta: Developers > Your App > Settings > Basic > App Secret (click Show). Redeploy after changing env vars.'
      );
      return NextResponse.json(
        {
          error: 'Invalid webhook signature',
          hint: '1) META_APP_SECRET in Vercel = App Secret from Meta (Settings > Basic > App Secret). 2) Redeploy after adding/changing it. 3) To test without verification, set SKIP_WEBHOOK_SIGNATURE_VERIFICATION=true (remove after test).',
        },
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse do JSON após verificação
    const body = JSON.parse(rawBody);

    // Log para debug
    console.log('[WhatsApp Webhook Route] Body parsed, starting async processing');

    // Processar webhook (assíncrono, não bloqueia resposta)
    handleWhatsAppWebhook(body).catch((error) => {
      console.error('[WhatsApp Webhook Route] Error processing webhook:', error);
      // Log stack trace completo
      if (error instanceof Error) {
        console.error('[WhatsApp Webhook Route] Stack:', error.stack);
      }
    });

    // Responder imediatamente
    return new NextResponse('OK', { status: 200 });
  } catch (error: any) {
    console.error('Error in WhatsApp webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
