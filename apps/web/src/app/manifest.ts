import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MonsterChat — Inbox Unificado',
    short_name: 'MonsterChat',
    description: 'Atendimento de WhatsApp e Instagram em um só lugar.',
    start_url: '/inbox',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0d0d1a',
    theme_color: '#0a0a18',
    lang: 'pt-BR',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
