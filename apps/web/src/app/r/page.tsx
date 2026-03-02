'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FacebookPixel, trackFacebookPixelLead } from '@/components/FacebookPixel';

function RedirectFallback() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-[#0a0a18] text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl text-center">
        <div className="inline-block w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-lg font-medium">Carregando...</p>
      </div>
    </div>
  );
}

/**
 * Página de redirecionamento para campanhas (Facebook Ads, Instagram etc.).
 * Uso: /r?utm_source=facebook&utm_medium=cpc&utm_campaign=nome&redirect_wa=5511999999999
 * Redireciona direto para o WhatsApp com uma mensagem que contém um código (ref).
 * Quando o lead enviar a primeira mensagem, o sistema identifica a origem da campanha pelo ref.
 */
function RedirectPageContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'redirect' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const utm = useMemo(
    () => ({
      utm_source: searchParams.get('utm_source') ?? undefined,
      utm_medium: searchParams.get('utm_medium') ?? undefined,
      utm_campaign: searchParams.get('utm_campaign') ?? undefined,
      utm_content: searchParams.get('utm_content') ?? undefined,
      utm_term: searchParams.get('utm_term') ?? undefined,
    }),
    [searchParams]
  );

  const redirectWa = useMemo(() => {
    const fromUrl = searchParams.get('redirect_wa')?.trim().replace(/\D/g, '');
    if (fromUrl) return fromUrl;
    const fromEnv = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_WHATSAPP_REDIRECT_NUMBER) || '';
    return fromEnv.replace(/\D/g, '');
  }, [searchParams]);

  const messageTemplate = useMemo(() => {
    const msg = searchParams.get('msg')?.trim();
    return msg || undefined;
  }, [searchParams]);

  const pixelId = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_FB_PIXEL_ID : undefined;

  useEffect(() => {
    if (!redirectWa) {
      setErrorMsg('Número do WhatsApp não configurado. Use redirect_wa na URL ou NEXT_PUBLIC_WHATSAPP_REDIRECT_NUMBER.');
      setStatus('error');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/lead-tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            direct: true,
            redirect_wa: redirectWa,
            message_template: messageTemplate,
            ...utm,
          }),
        });
        const data = await res.json();

        if (cancelled) return;
        if (!res.ok) {
          setErrorMsg(data.error || 'Erro ao redirecionar.');
          setStatus('error');
          return;
        }
        if (data.redirectUrl) {
          setStatus('redirect');
          trackFacebookPixelLead(pixelId);
          window.location.href = data.redirectUrl;
        } else {
          setErrorMsg('Redirecionamento não disponível.');
          setStatus('error');
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Erro de conexão. Tente novamente.');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [redirectWa, messageTemplate, utm.utm_source, utm.utm_medium, utm.utm_campaign, utm.utm_content, utm.utm_term]);

  return (
    <>
      <FacebookPixel pixelId={pixelId} trackPageView />
      {status === 'error' ? (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-[#0a0a18] text-white">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl text-center">
          <p className="text-red-400 font-medium">Não foi possível redirecionar</p>
          <p className="text-sm text-white/70 mt-2">{errorMsg}</p>
        </div>
      </div>
      ) : (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 bg-[#0a0a18] text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl text-center">
        <div className="inline-block w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-lg font-medium">Redirecionando para o WhatsApp...</p>
        <p className="text-sm text-white/60 mt-1">Você já pode iniciar a conversa. A origem da campanha será identificada automaticamente.</p>
      </div>
    </div>
      )}
    </>
  );
}

export default function RedirectPage() {
  return (
    <Suspense fallback={<RedirectFallback />}>
      <RedirectPageContent />
    </Suspense>
  );
}
