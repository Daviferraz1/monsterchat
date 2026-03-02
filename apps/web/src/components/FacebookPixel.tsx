'use client';

import Script from 'next/script';

declare global {
  interface Window {
    fbq?: (action: string, ...args: unknown[]) => void;
  }
}

interface FacebookPixelProps {
  pixelId: string | null | undefined;
  /** Disparar PageView ao carregar o script (página /r) */
  trackPageView?: boolean;
}

/**
 * Carrega o Facebook Pixel e opcionalmente dispara PageView.
 * Use em páginas de campanha (ex.: /r) para atribuição no Ads Manager.
 */
export function FacebookPixel({ pixelId, trackPageView = true }: FacebookPixelProps) {
  if (!pixelId) return null;

  return (
    <>
      <Script
        id="fb-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            ${trackPageView ? "fbq('track', 'PageView');" : ''}
          `,
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

/** Dispara evento Lead no Pixel (chame antes de redirecionar, ex.: página /r). */
export function trackFacebookPixelLead(pixelId: string | null | undefined): void {
  if (!pixelId || typeof window.fbq !== 'function') return;
  window.fbq('track', 'Lead');
}
