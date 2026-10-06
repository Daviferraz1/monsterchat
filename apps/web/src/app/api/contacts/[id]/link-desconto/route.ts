import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext } from '@/lib/api/team';
import {
  acharOfertaBase,
  centavos,
  ehAssinatura,
  gerarLinkComCupom,
  gerarLinkComDesconto,
} from '@/lib/api/integrations/guru-dynamic-offer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Link de checkout com desconto para este contato.
 *
 *   GET  /api/contacts/:id/link-desconto           → opções (curso + forma de pagamento)
 *   GET  /api/contacts/:id/link-desconto?item=…    → preço cheio atual na Guru e plano
 *   POST /api/contacts/:id/link-desconto  { item, valor, email? } → { link, de, por, cupom? }
 *
 * `item` é "<productId>|principal" ou "<productId>|mensal" (o segundo link das
 * assinaturas). Pagamento único vira oferta dinâmica com o valor novo; assinatura
 * vira cupom preso ao aluno (a Guru não troca valor de assinatura).
 *
 * Sem teto de desconto por enquanto (fase de teste): só exige valor entre zero e o
 * preço cheio. O teto entra aqui quando for combinado.
 */

const CHECKOUT_GURU = /pagamento\.monsterconcursos\.com\.br/;

async function linkDoItem(item: string): Promise<{ nome: string; url: string } | null> {
  const [productId, qual] = item.split('|');
  if (!productId) return null;
  const { data } = await supabaseAdmin
    .from('products')
    .select('name, checkout_url, checkout_url_subscription')
    .eq('id', productId)
    .maybeSingle();
  if (!data) return null;
  const url = qual === 'mensal' ? data.checkout_url_subscription : data.checkout_url;
  return url && CHECKOUT_GURU.test(url) ? { nome: data.name, url } : null;
}

export async function GET(request: NextRequest) {
  try {
    const item = request.nextUrl.searchParams.get('item');
    if (!item) {
      const { data } = await supabaseAdmin
        .from('products')
        .select('id, name, checkout_url, checkout_url_subscription')
        .eq('is_active', true)
        .eq('status', 'available')
        .order('name');
      const vistos = new Set<string>();
      const opcoes: Array<{ id: string; nome: string; tipo: 'oferta' | 'cupom' }> = [];
      for (const p of data ?? []) {
        const links: Array<[string, string | null]> = [
          ['principal', p.checkout_url],
          ['mensal', p.checkout_url_subscription],
        ];
        for (const [qual, url] of links) {
          if (!url || !CHECKOUT_GURU.test(url) || vistos.has(url)) continue;
          vistos.add(url);
          const assinatura = ehAssinatura(url);
          const sufixo = !p.checkout_url_subscription ? '' : qual === 'mensal' ? ' — mensal' : ' — à vista';
          opcoes.push({ id: `${p.id}|${qual}`, nome: `${p.name}${sufixo}`, tipo: assinatura ? 'cupom' : 'oferta' });
        }
      }
      return NextResponse.json({ ok: true, cursos: opcoes });
    }

    const l = await linkDoItem(item);
    if (!l) return NextResponse.json({ ok: false, message: 'Curso não encontrado.' }, { status: 404 });
    const base = await acharOfertaBase(l.url);
    if (!base) {
      return NextResponse.json({ ok: false, message: 'Não achei na Guru a oferta desse link de checkout.' }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      de: base.valor,
      tipo: ehAssinatura(l.url) ? 'cupom' : 'oferta',
      ciclos: base.ciclos ?? null,
      intervalo: base.intervalo ?? null,
    });
  } catch (err) {
    console.error('[API link-desconto GET]', err);
    return NextResponse.json({ ok: false, message: 'Falha ao consultar a Guru.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contactId } = await params;
    const body = (await request.json().catch(() => ({}))) as { item?: string; valor?: number; email?: string };
    const valor = centavos(Number(body.valor));
    if (!body.item || !Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ ok: false, message: 'Informe o curso e o valor final.' }, { status: 400 });
    }

    const [l, { data: c }] = await Promise.all([
      linkDoItem(body.item),
      supabaseAdmin.from('contacts').select('name, email, phone').eq('id', contactId).maybeSingle(),
    ]);
    if (!l) return NextResponse.json({ ok: false, message: 'Curso não encontrado.' }, { status: 404 });

    const base = await acharOfertaBase(l.url);
    if (!base) {
      return NextResponse.json({ ok: false, message: 'Não achei na Guru a oferta desse link de checkout.' }, { status: 404 });
    }
    if (valor >= base.valor) {
      return NextResponse.json(
        { ok: false, message: `O valor com desconto tem de ser menor que o preço cheio (R$ ${base.valor.toFixed(2)}).` },
        { status: 400 }
      );
    }

    const assinatura = ehAssinatura(l.url);
    // Assinatura exige e-mail: o checkout só aplica o cupom do link com o contato
    // preenchido, e sem e-mail não preenche nada. O que o atendente digitar vale e,
    // se o contato não tinha e-mail, fica salvo nele.
    const emailDigitado = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (emailDigitado && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailDigitado)) {
      return NextResponse.json({ ok: false, message: 'E-mail inválido.' }, { status: 400 });
    }
    const email = emailDigitado || c?.email?.trim() || '';
    if (assinatura && !email) {
      return NextResponse.json({ ok: false, message: 'Informe o e-mail do aluno para aplicar o cupom no link.' }, { status: 400 });
    }
    if (emailDigitado && !c?.email) {
      await supabaseAdmin.from('contacts').update({ email: emailDigitado }).eq('id', contactId);
    }
    const contato = { nome: c?.name, email: email || null, telefone: c?.phone };
    const r = assinatura
      ? await gerarLinkComCupom({ base, valor, contactId, contato })
      : { ...(await gerarLinkComDesconto({ base, valor, contactId, contato })), cupom: null };

    const agente = await getTeamContext();
    console.log('[link-desconto]', {
      por: agente?.fullName ?? agente?.userId,
      contactId,
      curso: l.nome,
      de: base.valor,
      valor,
      cupom: r.cupom,
      reaproveitado: r.reaproveitado,
    });
    return NextResponse.json({
      ok: true,
      link: r.link,
      de: base.valor,
      por: valor,
      cupom: r.cupom,
      ciclos: base.ciclos ?? null,
      intervalo: base.intervalo ?? null,
      reaproveitado: r.reaproveitado,
    });
  } catch (err) {
    console.error('[API link-desconto POST]', err);
    return NextResponse.json({ ok: false, message: 'Falha ao gerar o link na Guru.' }, { status: 500 });
  }
}
