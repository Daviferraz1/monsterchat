import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';
import { verifyWebhookSignature } from '@/lib/api/utils';
import { handleInstagramWebhook } from '@/lib/api/webhooks/instagram';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// GET para verificação do webhook (Meta envia hub.mode, hub.verify_token, hub.challenge)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

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
    // Instagram pode usar app próprio (Zap-IG): assinatura é com a Chave secreta do app do Instagram
    const instagramSecret = apiEnv.INSTAGRAM_APP_SECRET?.trim() || apiEnv.META_APP_SECRET;
    if (!instagramSecret || instagramSecret === 'placeholder-meta-secret') {
      console.error('[Instagram Webhook] Nenhum secret configurado. Defina INSTAGRAM_APP_SECRET (app Zap-IG) ou META_APP_SECRET.');
      return NextResponse.json(
        {
          error: 'App secret not configured',
          hint: 'If Instagram uses a separate app (e.g. Zap-IG): add INSTAGRAM_APP_SECRET in Vercel = "Chave secreta do app do Instagram" from Meta. Otherwise set META_APP_SECRET.',
        },
        { status: 503 }
      );
    }

    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      console.warn('[Instagram Webhook] Missing signature');
      return new NextResponse('Missing signature', { status: 401 });
    }

    const rawBody = await request.text();
    const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VERIFICATION === 'true';
    const isValid = skipVerify || verifyWebhookSignature(rawBody, signature, instagramSecret);

    if (skipVerify) {
      console.warn('[Instagram Webhook] Verificação de assinatura desativada (SKIP_WEBHOOK_SIGNATURE_VERIFICATION).');
    }

    if (!isValid) {
      console.error('[Instagram Webhook] Invalid signature.');
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);
    console.log('[Instagram Webhook Route] Body parsed, processing...');

    try {
      await handleInstagramWebhook(body);
      console.log('[Instagram Webhook Route] Processing finished OK');
    } catch (error) {
      console.error('[Instagram Webhook Route] Error processing webhook:', error);
      if (error instanceof Error) {
        console.error('[Instagram Webhook Route] Stack:', error.stack);
      }
      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: 500 }
      );
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error: unknown) {
    console.error('Error in Instagram webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
