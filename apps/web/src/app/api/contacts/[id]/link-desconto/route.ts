import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/api/supabase';
import { getTeamContext } from '@/lib/api/team';
import { acharOfertaBase, centavos, ehAssinatura, gerarLinkComDesconto } from '@/lib/api/integrations/guru-dynamic-offer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Link de checkout com desconto para este contato (oferta dinâmica da Guru).
 *
 *   GET  /api/contacts/:id/link-desconto              → cursos que aceitam desconto
 *   GET  /api/contacts/:id/link-desconto?productId=…  → preço cheio atual na Guru
 *   POST /api/contacts/:id/link-desconto  { productId, valor } → { link, de, por }
 *
 * Sem teto de desconto por enquanto (fase de teste): só exige valor entre zero e o
 * preço cheio. O teto entra aqui quando for combinado.
 */

async function produto(productId: string) {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, name, checkout_url, price_cents')
    .eq('id', productId)
    .maybeSingle();
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const productId = request.nextUrl.searchParams.get('productId');
    if (!productId) {
      const { data } = await supabaseAdmin
        .from('products')
        .select('id, name, brand, checkout_url, price_cents')
        .eq('is_active', true)
        .eq('status', 'available')
        .order('name');
      // Só checkout da Guru e de pagamento único: assinatura não aceita valor dinâmico.
      const cursos = (data ?? [])
        .filter((p) => /pagamento\.monsterconcursos\.com\.br/.test(p.checkout_url ?? '') && !ehAssinatura(p.checkout_url))
        .filter((p, i, arr) => arr.findIndex((q) => q.checkout_url === p.checkout_url) === i)
        .map((p) => ({ id: p.id, nome: p.name, precoCents: p.price_cents }));
      return NextResponse.json({ ok: true, cursos });
    }

    const p = await produto(productId);
    if (!p) return NextResponse.json({ ok: false, message: 'Curso não encontrado.' }, { status: 404 });
    const base = await acharOfertaBase(p.checkout_url);
    if (!base) {
      return NextResponse.json({ ok: false, message: 'Não achei na Guru a oferta desse link de checkout.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, de: base.valor, oferta: base.nome });
  } catch (err) {
    console.error('[API link-desconto GET]', err);
    return NextResponse.json({ ok: false, message: 'Falha ao consultar a Guru.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contactId } = await params;
    const body = (await request.json().catch(() => ({}))) as { productId?: string; valor?: number };
    const valor = centavos(Number(body.valor));
    if (!body.productId || !Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ ok: false, message: 'Informe o curso e o valor final.' }, { status: 400 });
    }

    const [p, { data: contato }] = await Promise.all([
      produto(body.productId),
      supabaseAdmin.from('contacts').select('name, email, phone').eq('id', contactId).maybeSingle(),
    ]);
    if (!p) return NextResponse.json({ ok: false, message: 'Curso não encontrado.' }, { status: 404 });
    if (ehAssinatura(p.checkout_url)) {
      return NextResponse.json(
        { ok: false, message: 'Esse curso é assinatura: a Guru não troca o valor nesse checkout. Use cupom.' },
        { status: 400 }
      );
    }

    const base = await acharOfertaBase(p.checkout_url);
    if (!base) {
      return NextResponse.json({ ok: false, message: 'Não achei na Guru a oferta desse link de checkout.' }, { status: 404 });
    }
    if (valor >= base.valor) {
      return NextResponse.json(
        { ok: false, message: `O valor com desconto tem de ser menor que o preço cheio (R$ ${base.valor.toFixed(2)}).` },
        { status: 400 }
      );
    }

    const agente = await getTeamContext();
    const r = await gerarLinkComDesconto({
      base,
      valor,
      contactId,
      contato: { nome: contato?.name, email: contato?.email, telefone: contato?.phone },
    });
    console.log('[link-desconto]', {
      por: agente?.fullName ?? agente?.userId,
      contactId,
      curso: p.name,
      de: base.valor,
      valor,
      ofertaDinamica: r.id,
      reaproveitado: r.reaproveitado,
    });
    return NextResponse.json({ ok: true, link: r.link, de: base.valor, por: valor, reaproveitado: r.reaproveitado });
  } catch (err) {
    console.error('[API link-desconto POST]', err);
    return NextResponse.json({ ok: false, message: 'Falha ao gerar o link na Guru.' }, { status: 500 });
  }
}
