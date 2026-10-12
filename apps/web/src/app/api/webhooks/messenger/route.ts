import { NextRequest, NextResponse } from 'next/server';
import { apiEnv } from '@/lib/api/env';
import { verifyWebhookSignature } from '@/lib/api/utils';
import { handleMessengerWebhook } from '@/lib/api/webhooks/messenger';
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
    if (token === apiEnv.META_WEBHOOK_VERIFY_TOKEN) {
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  return new NextResponse('Forbidden', { status: 403 });
}

// POST para receber webhooks da Página (object "page")
export async function POST(request: NextRequest) {
  try {
    // O Messenger pode estar no app principal (META_APP_SECRET) ou no mesmo app do Instagram
    // (INSTAGRAM_APP_SECRET): a assinatura vale se bater com qualquer um dos dois.
    const secrets = [apiEnv.META_APP_SECRET, apiEnv.INSTAGRAM_APP_SECRET?.trim()].filter(
      (s): s is string => Boolean(s) && s !== 'placeholder-meta-secret'
    );
    if (secrets.length === 0) {
      console.error('[Messenger Webhook] Nenhum secret configurado. Defina META_APP_SECRET (ou INSTAGRAM_APP_SECRET).');
      return NextResponse.json({ error: 'App secret not configured' }, { status: 503 });
    }

    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      console.warn('[Messenger Webhook] Missing signature');
      return new NextResponse('Missing signature', { status: 401 });
    }

    const rawBody = await request.text();
    const skipVerify = process.env.SKIP_WEBHOOK_SIGNATURE_VERIFICATION === 'true';
    if (skipVerify) {
      console.warn('[Messenger Webhook] Verificação de assinatura desativada (SKIP_WEBHOOK_SIGNATURE_VERIFICATION).');
    }
    if (!skipVerify && !secrets.some((secret) => verifyWebhookSignature(rawBody, signature, secret))) {
      console.error('[Messenger Webhook] Invalid signature.');
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    try {
      // Se o app da Meta mandar os dois objetos para a mesma URL, cada um vai para o seu handler.
      if (body?.object === 'instagram') {
        await handleInstagramWebhook(body);
      } else {
        await handleMessengerWebhook(body);
      }
    } catch (error) {
      console.error('[Messenger Webhook Route] Error processing webhook:', error);
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (error: unknown) {
    console.error('Error in Messenger webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
