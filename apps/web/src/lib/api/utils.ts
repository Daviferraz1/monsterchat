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

/**
 * Remove caracteres inválidos do token para uso no header Authorization.
 * Evita "Invalid character in header content" quando o token foi colado com quebra de linha ou espaços extras.
 */
export function sanitizeTokenForHeader(token: string | null | undefined): string {
  if (token == null) return '';
  return String(token).replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza telefone para formato canônico (comparação/match).
 * No Brasil: celular pode vir 8 dígitos (ex.: 99061942) ou 9 dígitos (999061942); ambos são o mesmo número.
 * Retorna: só dígitos; se 55 + 2 (DDD) + 8 dígitos, insere "9" após o DDD.
 * Ex.: 553799061942 e 5537999061942 → ambos viram 5537999061942.
 */
export function normalizePhoneCanonical(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length === 12) return digits.slice(0, 4) + '9' + digits.slice(4);
  if (digits.startsWith('55') && digits.length === 11) return digits.slice(0, 4) + '9' + digits.slice(4);
  return digits;
}
