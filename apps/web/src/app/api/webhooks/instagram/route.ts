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
    if (!apiEnv.META_APP_SECRET || apiEnv.META_APP_SECRET === 'placeholder-meta-secret') {
      console.error('[Instagram Webhook] META_APP_SECRET não configurado no Vercel');
      return NextResponse.json(
        {
          error: 'META_APP_SECRET not configured',
          hint: 'Add META_APP_SECRET in Vercel Environment Variables (same as WhatsApp).',
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
    const isValid = skipVerify || verifyWebhookSignature(rawBody, signature, apiEnv.META_APP_SECRET);

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
