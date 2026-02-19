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
