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

/**
 * Retorna o payload como string para verificação de assinatura
 */
export function getRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on('end', () => {
      resolve(data);
    });
    req.on('error', reject);
  });
}
