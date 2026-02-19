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
    // Obter assinatura do header
    const signature = request.headers.get('x-hub-signature-256');
    
    if (!signature) {
      console.warn('Missing webhook signature');
      return new NextResponse('Missing signature', { status: 401 });
    }

    // Obter body raw para verificação
    const rawBody = await request.text();
    
    // Verificar assinatura
    const isValid = verifyWebhookSignature(
      rawBody,
      signature,
      apiEnv.META_APP_SECRET
    );

    if (!isValid) {
      console.warn('Invalid webhook signature');
      return new NextResponse('Invalid signature', { status: 401 });
    }

    // Parse do JSON após verificação
    const body = JSON.parse(rawBody);

    // Processar webhook (assíncrono, não bloqueia resposta)
    handleWhatsAppWebhook(body).catch((error) => {
      console.error('Error processing WhatsApp webhook:', error);
    });

    // Responder imediatamente
    return new NextResponse('OK', { status: 200 });
  } catch (error: any) {
    console.error('Error in WhatsApp webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
