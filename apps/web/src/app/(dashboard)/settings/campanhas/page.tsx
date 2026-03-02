'use client';

import { useState, useEffect, useCallback } from 'react';
import { Megaphone, Copy, Check, ExternalLink, HelpCircle } from 'lucide-react';

const STORAGE_KEY = 'monsterchat_whatsapp_redirect';

function getStoredNumber(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

function setStoredNumber(value: string): void {
  if (typeof window === 'undefined') return;
  const digits = value.replace(/\D/g, '');
  localStorage.setItem(STORAGE_KEY, digits);
}

const DEFAULT_MESSAGE = 'Olá! 👋 Quero conversar.';

function buildTrackingUrl(params: {
  baseUrl: string;
  redirectWa: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  message_ref?: string;
}): string {
  const search = new URLSearchParams();
  if (params.utm_source) search.set('utm_source', params.utm_source);
  if (params.utm_medium) search.set('utm_medium', params.utm_medium);
  if (params.utm_campaign) search.set('utm_campaign', params.utm_campaign);
  if (params.utm_content) search.set('utm_content', params.utm_content);
  if (params.utm_term) search.set('utm_term', params.utm_term);
  if (params.redirectWa) search.set('redirect_wa', params.redirectWa.startsWith('55') ? params.redirectWa : `55${params.redirectWa}`);
  const msg = (params.message_ref || '').trim();
  if (msg && msg !== DEFAULT_MESSAGE) search.set('msg', msg);
  const qs = search.toString();
  return qs ? `${params.baseUrl}/r?${qs}` : `${params.baseUrl}/r`;
}

export default function CampanhasPage() {
  const [mounted, setMounted] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [utmTerm, setUtmTerm] = useState('');
  const [messageRef, setMessageRef] = useState(DEFAULT_MESSAGE);
  const [copied, setCopied] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => {
    setMounted(true);
    setWhatsappNumber(getStoredNumber());
    setBaseUrl(typeof window !== 'undefined' ? window.location.origin : '');
  }, []);

  const handleSaveNumber = useCallback(() => {
    const digits = whatsappNumber.replace(/\D/g, '');
    setStoredNumber(digits);
    setWhatsappNumber(digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '');
  }, [whatsappNumber]);

  const generatedUrl = mounted && baseUrl
    ? buildTrackingUrl({
        baseUrl,
        redirectWa: whatsappNumber.replace(/\D/g, ''),
        utm_source: utmSource.trim(),
        utm_medium: utmMedium.trim(),
        utm_campaign: utmCampaign.trim(),
        utm_content: utmContent.trim(),
        utm_term: utmTerm.trim(),
        message_ref: messageRef.trim() || undefined,
      })
    : '';

  const copyToClipboard = async () => {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = generatedUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-8 bg-white min-h-full">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone className="w-7 h-7 text-[#6d28d9]" />
          Rastreamento de campanhas
        </h1>
        <p className="text-gray-600 mt-1 text-sm">
          Configure links para Facebook Ads, Instagram e outras campanhas. Os leads que clicarem e enviarem a primeira mensagem no WhatsApp terão a origem atribuída automaticamente.
        </p>
      </div>

      {/* Número do WhatsApp */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Número do WhatsApp para redirecionamento</h2>
        <p className="text-sm text-gray-600">
          Número usado nos links gerados. O lead será redirecionado para este WhatsApp após informar o próprio número.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="tel"
            placeholder="5511999999999"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            onBlur={handleSaveNumber}
            className="flex-1 min-w-[200px] rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 placeholder:text-gray-500 focus:border-[#6d28d9] focus:outline-none focus:ring-1 focus:ring-[#6d28d9] caret-[#6d28d9]"
          />
          <button
            type="button"
            onClick={handleSaveNumber}
            className="px-4 py-2.5 rounded-lg bg-[#6d28d9] text-white font-medium hover:opacity-90 transition-opacity"
          >
            Salvar
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Use DDD + número (ex.: 5511999999999). Em produção você pode definir{' '}
          <code className="bg-gray-100 px-1 rounded text-gray-800">NEXT_PUBLIC_WHATSAPP_REDIRECT_NUMBER</code> no .env para não precisar colocar o número na URL.
        </p>
      </section>

      {/* Facebook Pixel + CAPI */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Facebook Pixel e Conversions API</h2>
        <p className="text-sm text-gray-600">
          Para atribuição precisa no Facebook Ads Manager e otimização de campanhas, configure o Pixel (página /r) e o CAPI (envio server-side quando o lead envia a primeira mensagem no WhatsApp).
        </p>
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-700 space-y-2">
          <p className="font-medium text-gray-900">Variáveis no .env (ou Vercel):</p>
          <ul className="list-disc list-inside space-y-1 font-mono text-xs">
            <li><code className="bg-white px-1 rounded">NEXT_PUBLIC_FB_PIXEL_ID</code> — ID do Pixel (Events Manager)</li>
            <li><code className="bg-white px-1 rounded">FB_CAPI_ACCESS_TOKEN</code> — Token de acesso do CAPI (gerado no Events Manager)</li>
          </ul>
          <p className="text-xs text-gray-500 pt-1">
            O Pixel dispara PageView e Lead na página /r. O CAPI envia o evento Lead quando o contato envia a primeira mensagem no WhatsApp (telefone em hash para privacidade).
          </p>
        </div>
      </section>

      {/* Gerar link */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Gerar link de rastreamento</h2>
        <p className="text-sm text-gray-600">
          Preencha os parâmetros UTM que você usa nas campanhas. O link gerado pode ser usado como destino nos anúncios.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">utm_source (ex.: facebook, instagram)</label>
            <input
              type="text"
              placeholder="facebook"
              value={utmSource}
              onChange={(e) => setUtmSource(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-[#6d28d9] focus:outline-none text-sm caret-[#6d28d9]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">utm_medium (ex.: cpc, social)</label>
            <input
              type="text"
              placeholder="cpc"
              value={utmMedium}
              onChange={(e) => setUtmMedium(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-[#6d28d9] focus:outline-none text-sm caret-[#6d28d9]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">utm_campaign (nome da campanha)</label>
            <input
              type="text"
              placeholder="black_friday_2025"
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-[#6d28d9] focus:outline-none text-sm caret-[#6d28d9]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">utm_content (opcional)</label>
            <input
              type="text"
              placeholder="banner_principal"
              value={utmContent}
              onChange={(e) => setUtmContent(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-[#6d28d9] focus:outline-none text-sm caret-[#6d28d9]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">utm_term (opcional)</label>
            <input
              type="text"
              placeholder="palavra_chave"
              value={utmTerm}
              onChange={(e) => setUtmTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-[#6d28d9] focus:outline-none text-sm caret-[#6d28d9]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Mensagem que o lead verá no WhatsApp</label>
            <input
              type="text"
              placeholder="Olá! 👋 Quero conversar."
              value={messageRef}
              onChange={(e) => setMessageRef(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 placeholder:text-gray-500 focus:border-[#6d28d9] focus:outline-none text-sm caret-[#6d28d9]"
            />
            <p className="text-xs text-gray-500 mt-1">
              Um código será adicionado no final automaticamente para identificarmos a campanha. O lead não precisa alterar nada.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            readOnly
            value={generatedUrl}
            className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 font-mono truncate"
          />
          <button
            type="button"
            onClick={copyToClipboard}
            disabled={!generatedUrl}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#6d28d9]/10 text-[#6d28d9] hover:bg-[#6d28d9]/20 disabled:opacity-50 transition-colors font-medium text-sm"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>
        </div>
        <a
          href="/r"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[#6d28d9] hover:underline font-medium"
        >
          <ExternalLink className="w-4 h-4" />
          Abrir página de captura em nova aba
        </a>
      </section>

      {/* Como usar */}
      <section className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#6d28d9]" />
          Como usar
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          <li>Salve o número do WhatsApp acima e preencha os UTMs da sua campanha.</li>
          <li>Copie o link gerado e use como <strong className="text-gray-900">URL de destino</strong> nos anúncios (Facebook Ads, Instagram, Google etc.).</li>
          <li>Quando alguém clicar no anúncio, será <strong className="text-gray-900">redirecionado direto para o WhatsApp</strong> (sem formulário). A primeira mensagem já virá com um código que identifica a campanha.</li>
          <li>Quando o lead enviar essa primeira mensagem, o sistema atribui automaticamente a origem da campanha ao contato.</li>
          <li>Em <strong className="text-gray-900">Contatos</strong>, você verá um badge com a fonte (ex.: facebook, instagram) e o nome da campanha.</li>
        </ol>
      </section>
    </div>
  );
}
