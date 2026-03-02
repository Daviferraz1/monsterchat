import crypto from 'crypto';
import { apiEnv } from '../env';
import { normalizePhoneCanonical } from '../utils';

/** Normaliza telefone para hash CAPI: só dígitos com código do país (ex.: 5511999999999). */
function normalizePhoneForCapi(phone: string | null | undefined): string {
  const canon = normalizePhoneCanonical(phone);
  if (!canon) return '';
  if (canon.startsWith('55')) return canon;
  if (canon.length >= 10 && canon.length <= 11) return `55${canon}`;
  return canon;
}

/** Retorna SHA256 em hex (lowercase) para CAPI. */
function sha256(value: string): string {
  if (!value) return '';
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export interface SendLeadEventParams {
  phone: string;
  email?: string;
  eventId: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

/**
 * Envia evento Lead para o Facebook Conversions API (CAPI).
 * Chamado quando atribuímos uma campanha ao contato (ex.: primeira mensagem no WhatsApp).
 * Requer FB_CAPI_ACCESS_TOKEN e NEXT_PUBLIC_FB_PIXEL_ID nas variáveis de ambiente.
 */
export async function sendFacebookCAPILead(params: SendLeadEventParams): Promise<boolean> {
  const pixelId = apiEnv.NEXT_PUBLIC_FB_PIXEL_ID;
  const accessToken = apiEnv.FB_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken || pixelId === 'placeholder' || accessToken === 'placeholder') {
    return false;
  }

  const phoneNorm = normalizePhoneForCapi(params.phone);
  if (!phoneNorm) return false;

  const userData: Record<string, string | string[]> = {
    ph: [sha256(phoneNorm)],
  };
  if (params.email?.trim()) {
    userData.em = [sha256(params.email.trim())];
  }

  const payload = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: params.eventId,
        action_source: 'app' as const,
        user_data: userData,
        custom_data: {
          ...(params.utmSource && { utm_source: params.utmSource }),
          ...(params.utmMedium && { utm_medium: params.utmMedium }),
          ...(params.utmCampaign && { utm_campaign: params.utmCampaign }),
          ...(params.utmContent && { utm_content: params.utmContent }),
          ...(params.utmTerm && { utm_term: params.utmTerm }),
        },
      },
    ],
  };

  try {
    const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[Facebook CAPI] Erro ao enviar Lead:', res.status, errText);
      return false;
    }
    const data = (await res.json()) as { events_received?: number; fbtrace_id?: string };
    if (data.events_received === 0) {
      console.warn('[Facebook CAPI] Nenhum evento recebido:', data);
    }
    return true;
  } catch (err) {
    console.error('[Facebook CAPI] Falha ao enviar Lead:', err);
    return false;
  }
}
