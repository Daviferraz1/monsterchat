import crypto from 'crypto';

/**
 * Verifica a assinatura do webhook da Meta usando X-Hub-Signature-256
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // Remove o prefixo "sha256=" se existir
  const sig = signature.replace('sha256=', '');
  
  // Calcula o hash esperado
  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  // Compara usando timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(sig, 'hex'),
    Buffer.from(expectedHash, 'hex')
  );
}
