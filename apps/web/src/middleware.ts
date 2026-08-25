import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Proteção de acesso das rotas de API (/api/*).
 *
 * Contexto: as páginas do dashboard usam AuthGuard (client-side), mas as rotas
 * de API eram endpoints HTTP abertos — qualquer um com um conversation_id conseguia
 * POST em /api/messages e enviar mensagem ao cliente se passando pelo atendente.
 *
 * Este middleware exige uma SESSÃO válida do Supabase para todas as rotas /api/*,
 * exceto as chamadas por sistemas externos legítimos, que têm verificação própria:
 *   - webhooks da Meta (assinatura x-hub-signature-256)
 *   - webhook do ponto Control iD (segredo compartilhado)
 *   - webhook da Digital Guru (api_token no corpo)
 *   - cron da Vercel (CRON_SECRET no header)
 *   - lead-tracking e health (públicos por design)
 */

/** Prefixos de API liberados (sistemas externos com verificação própria ou públicos). */
const PUBLIC_API_PREFIXES = [
  '/api/health',
  '/api/webhooks/whatsapp',
  '/api/webhooks/instagram',
  '/api/ponto/controlid',
  '/api/lead-tracking',
  '/api/ia/cron/', // qualquer cron (protegido por CRON_SECRET no próprio handler)
  '/api/tasks/cron/', // gerador de tarefas recorrentes (idem)
  '/api/instagram/cron/', // renovação do token do Instagram Login (idem)
];

function isPublicApi(pathname: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) {
    return true;
  }
  // Só o receptor de webhook da Guru (rota exata) é público. As subrotas
  // (/sync, /import-retroactive, /sales, /subscriptions) são operações do painel
  // e continuam exigindo sessão.
  if (pathname === '/api/integrations/digital-guru') return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicApi(pathname)) {
    return NextResponse.next();
  }

  // Cron novo que ninguém lembrou de liberar acima: o Cron da Vercel não manda cookie de
  // sessão, então ele leva 401 em toda execução — calado, até alguém abrir o log da Vercel.
  // A lista continua sendo explícita de propósito (liberar por padrão deixaria um cron sem
  // CRON_SECRET aberto na internet), mas o motivo agora aparece.
  if (/^\/api\/.+\/cron(\/|$)/.test(pathname)) {
    console.error(
      `[middleware] ${pathname} parece um cron e NÃO está em PUBLIC_API_PREFIXES — vai levar 401 sempre. ` +
      'Adicione o prefixo lá e garanta a checagem de CRON_SECRET no handler.'
    );
  }

  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // getUser() valida o JWT junto ao Supabase (e renova via refresh token se preciso).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  return response;
}

export const config = {
  // Só as rotas de API. As páginas continuam protegidas pelo AuthGuard.
  matcher: ['/api/:path*'],
};
