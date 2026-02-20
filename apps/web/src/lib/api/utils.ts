import crypto from 'crypto';

/**
 * Verifica a assinatura do webhook da Meta usando X-Hub-Signature-256.
 * A Meta usa: HMAC-SHA256(raw_body_utf8, app_secret) em hex.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const sig = signature.replace(/^sha256=/, '');
  const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;

  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(payloadBuffer)
    .digest('hex');

  if (sig.length !== expectedHash.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Extrai o primeiro endereço de email encontrado no texto.
 * Útil quando o contato envia o email na conversa (ex.: Instagram/WhatsApp).
 */
export function extractEmailFromText(text: string | undefined): string | undefined {
  if (!text || typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  const match = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : undefined;
}
