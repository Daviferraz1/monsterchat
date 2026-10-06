import { NextResponse } from 'next/server';
import { listProducts, type ProductRow } from '@/lib/api/ia/catalog';
import {
  OPENING_SCRIPT,
  courseLabel,
  formatPriceLine,
  formatSalesPitch,
  salesLinkWithUtm,
} from '@/lib/api/ia/team-templates';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ia/mensagens-rapidas — textos prontos para o atendente inserir na
 * caixa de mensagem (botão ⚡ ou "/" no início do texto).
 *
 * A apresentação de curso é a mesma que a IA usa (formatSalesPitch), então
 * quando a sugestão não acha o curso o atendente cai no mesmo texto padrão.
 * O link sai com utm_content=rapida, para separar das vendas vindas da IA.
 */

interface MensagemRapida {
  id: string;
  titulo: string;
  grupo: 'Geral' | 'Monster' | 'Fagenius';
  /** Palavras extras para a busca (concurso, cargo, slug). */
  busca: string;
  texto: string;
}

/** Fagenius tem tom formal e não usa a lista ✅ dos preparatórios. */
function apresentacaoFagenius(p: ProductRow): string | null {
  const link = p.sales_page_url?.trim() || p.checkout_url?.trim();
  if (!link) return null;
  const linhas = [courseLabel(p)];
  if (p.duration?.trim()) linhas.push(`Duração: ${p.duration.trim()}`);
  const avista = formatPriceLine(p.price_display);
  if (avista || p.price_recurring_display?.trim()) {
    linhas.push('', 'Valores:');
    if (avista) linhas.push(avista);
    if (p.price_recurring_display?.trim()) linhas.push(`ou ${p.price_recurring_display.trim()}`);
  }
  linhas.push('', 'Mais informações e matrícula:', salesLinkWithUtm(link, 'rapida'));
  return linhas.join('\n');
}

export async function GET() {
  try {
    const produtos = await listProducts({ is_active: true, status: 'available' });
    const mensagens: MensagemRapida[] = [
      { id: 'abertura', titulo: 'Abertura (qual o seu objetivo?)', grupo: 'Geral', busca: 'oi ola inicio saudacao', texto: OPENING_SCRIPT },
    ];
    const vistos = new Set<string>();
    for (const p of produtos) {
      const titulo = courseLabel(p);
      // O catálogo tem cursos repetidos (ex.: Ipatinga duas vezes); fica o primeiro.
      if (vistos.has(titulo.toLowerCase())) continue;
      const texto = p.brand === 'fagenius' ? apresentacaoFagenius(p) : formatSalesPitch(p, 'rapida');
      if (!texto) continue;
      vistos.add(titulo.toLowerCase());
      mensagens.push({
        id: p.id,
        titulo,
        grupo: p.brand === 'fagenius' ? 'Fagenius' : 'Monster',
        busca: [p.slug, p.target_exam, p.target_role, p.category].filter(Boolean).join(' '),
        texto,
      });
    }
    const ordemGrupo = { Geral: 0, Monster: 1, Fagenius: 2 };
    mensagens.sort((a, b) => ordemGrupo[a.grupo] - ordemGrupo[b.grupo] || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    return NextResponse.json({ ok: true, mensagens });
  } catch (err) {
    console.error('[API mensagens-rapidas]', err);
    return NextResponse.json({ ok: false, mensagens: [] }, { status: 500 });
  }
}
