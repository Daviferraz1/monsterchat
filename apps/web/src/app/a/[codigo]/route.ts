import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { resolverLink, type ResultadoClique } from '@/lib/api/services/acesso-direto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /a/<codigo> — o clique no link de acesso que foi pelo WhatsApp.
 *
 * Válido: redireciona para o magic link da plataforma (gerado agora, vale 1h),
 * que entra logado no Monster Study. Inválido: uma página curta, em português
 * simples, com o botão para pedir outro link no WhatsApp — o público não lê
 * mensagens de erro técnicas.
 *
 * Fora do middleware (que só cobre /api) e fora do AuthGuard das páginas: é
 * público de propósito, e o código de 128 bits é o que protege.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const resultado = await resolverLink(codigo);
  if (resultado.ok) {
    return NextResponse.redirect(resultado.destino, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  }
  return new NextResponse(await paginaDeErro(resultado), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const TEXTOS: Record<Exclude<ResultadoClique, { ok: true }>['motivo'], { titulo: string; corpo: string }> = {
  nao_encontrado: { titulo: 'Este link não existe', corpo: 'Confira se o link foi copiado inteiro ou peça um novo pelo WhatsApp.' },
  expirado: { titulo: 'Este link venceu', corpo: 'Ele valia por 7 dias. É só pedir um novo pelo WhatsApp que a gente manda na hora.' },
  esgotado: { titulo: 'Este link já foi usado', corpo: 'Por segurança, cada link entra poucas vezes. Peça um novo pelo WhatsApp.' },
  revogado: { titulo: 'Este link foi cancelado', corpo: 'Peça um novo pelo WhatsApp.' },
  sem_conta: {
    titulo: 'Seu acesso ainda está sendo liberado',
    corpo: 'Se você acabou de pagar, aguarde alguns minutos e toque no link de novo. Se já passou de 1 hora, fale com a gente no WhatsApp.',
  },
  plataforma_indisponivel: { titulo: 'Não conseguimos entrar agora', corpo: 'Tente de novo em alguns minutos. Se continuar, fale com a gente no WhatsApp.' },
};

async function numeroDoWhatsApp(): Promise<string> {
  const { data } = await supabaseAdmin.from('channels').select('name').eq('type', 'whatsapp').eq('is_active', true).limit(1).maybeSingle();
  return ((data as { name?: string } | null)?.name || '').replace(/\D/g, '');
}

async function paginaDeErro(resultado: Exclude<ResultadoClique, { ok: true }>): Promise<string> {
  const { titulo, corpo } = TEXTOS[resultado.motivo];
  const numero = await numeroDoWhatsApp();
  const mensagem = encodeURIComponent('Oi! Preciso de um novo link de acesso à plataforma.');
  const botao = numero
    ? `<a class="btn" href="https://wa.me/${numero}?text=${mensagem}">Pedir novo link no WhatsApp</a>`
    : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${titulo} · Monster Concursos</title>
<style>
  body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
  .card{max-width:420px;width:100%;background:#151515;border:1px solid #2a2a2a;border-radius:16px;padding:28px 24px;text-align:center}
  h1{font-size:22px;margin:0 0 10px}p{color:#bbb;line-height:1.5;margin:0 0 22px;font-size:16px}
  .btn{display:block;background:#f26522;color:#fff;text-decoration:none;font-weight:600;padding:14px 18px;border-radius:12px;font-size:16px}
  small{display:block;margin-top:18px;color:#777;font-size:12px}
</style></head>
<body><div class="card"><h1>${titulo}</h1><p>${corpo}</p>${botao}<small>Monster Concursos</small></div></body></html>`;
}
