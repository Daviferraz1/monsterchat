import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { RESEND_PLATFORMS, type ResendPlatform } from '@/lib/api/integrations/resend';

export const dynamic = 'force-dynamic';

/**
 * POST: salva login/senha em um contato (para reenviar acesso no chat).
 * Body: { contactId, platform, login, password, resendEmailId?, sentAt? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const contactId = body.contactId ?? body.contact_id;
    const platform = body.platform;
    const login = typeof body.login === 'string' ? body.login.trim() : '';
    const password = typeof body.password === 'string' ? body.password.trim() : '';

    if (!contactId || !login || !password) {
      return NextResponse.json(
        { error: 'contactId, login e password são obrigatórios' },
        { status: 400 }
      );
    }
    const platformVal = RESEND_PLATFORMS.includes(platform) ? (platform as ResendPlatform) : 'monster_study';
    const resendEmailId = typeof body.resendEmailId === 'string' ? body.resendEmailId : null;
    const sentAt = body.sentAt ?? body.sent_at ?? new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('contact_access_credentials')
      .upsert(
        {
          contact_id: contactId,
          platform: platformVal,
          login,
          password,
          resend_email_id: resendEmailId,
          sent_at: sentAt,
        },
        { onConflict: 'contact_id,platform' }
      )
      .select('id, contact_id, platform, login, sent_at')
      .single();

    if (error) {
      console.warn('[API resend/save-credentials]', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[API resend/save-credentials]', err);
    return NextResponse.json({ error: 'Erro ao salvar credenciais' }, { status: 500 });
  }
}
