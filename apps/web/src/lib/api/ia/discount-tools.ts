/**
 * Desconto de aluno: o link com preço especial só sai depois de confirmar no
 * Guru que o e-mail tem compra paga. O link NÃO fica no catálogo — o catálogo
 * é mostrado a qualquer lead, e o desconto é só para quem já é aluno.
 *
 * Os descontos vivem em ia_settings (key "descontos_aluno"), para criar ou
 * encerrar um sem deploy:
 *   { "itens": [{ "curso": "...", "termos": ["pcmg", ...], "de": "R$ 497,00",
 *                 "por": "R$ 397,00", "parcelado": "12x de R$ 44,20", "link": "https://..." }] }
 */
import { supabaseAdmin } from '../supabase';
import { fetchGuruTransactionsLive } from '../integrations/guru-live';

interface DescontoAluno {
  curso: string;
  termos: string[];
  de: string;
  por: string;
  parcelado?: string;
  link: string;
  ativo?: boolean;
}

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

async function descontos(): Promise<DescontoAluno[]> {
  const { data } = await supabaseAdmin.from('ia_settings').select('value').eq('key', 'descontos_aluno').maybeSingle();
  const itens = (data?.value as { itens?: DescontoAluno[] } | null)?.itens ?? [];
  return itens.filter((d) => d.ativo !== false && d.link && d.termos?.length);
}

function acharDesconto(curso: string, lista: DescontoAluno[]): DescontoAluno | undefined {
  const alvo = ` ${normalizar(curso)} `;
  return lista.find((d) => d.termos.some((t) => alvo.includes(` ${normalizar(t)} `)));
}

/** Compra paga (não reembolsada) com este e-mail: base local primeiro, Guru ao vivo se não achar. */
async function ehAluno(email: string): Promise<{ aluno: boolean; produtos: string[]; fonte: string }> {
  const { data } = await supabaseAdmin
    .from('guru_sales')
    .select('product_names')
    .ilike('contact_email', email)
    .eq('status', 'approved')
    .limit(10);
  if (data?.length) {
    return { aluno: true, produtos: [...new Set(data.map((r) => String(r.product_names)))], fonte: 'vendas do Guru' };
  }
  const live = await fetchGuruTransactionsLive({ email });
  if (live.ok && live.approved) return { aluno: true, produtos: [], fonte: 'Guru ao vivo' };
  return { aluno: false, produtos: [], fonte: live.ok ? 'Guru ao vivo' : 'vendas do Guru' };
}

export async function toolVerificarDescontoAluno(input: { email?: string; curso?: string }): Promise<string> {
  const lista = await descontos();
  const desconto = acharDesconto(input.curso ?? '', lista);
  if (!desconto) {
    return 'Não há desconto de aluno cadastrado para esse curso. Não ofereça desconto nem invente condição; informe o preço normal do catálogo.';
  }
  const email = (input.email ?? '').trim().toLowerCase();
  if (!email.includes('@')) {
    return `Existe condição especial de aluno para ${desconto.curso}, mas só para quem já é aluno. Peça o e-mail usado nas compras anteriores e chame de novo com ele. Não informe o valor nem o link antes de confirmar.`;
  }
  const r = await ehAluno(email);
  if (!r.aluno) {
    return `Não encontrei compra paga com o e-mail ${email} (${r.fonte}). NÃO envie o link de desconto nem o valor de aluno. Pergunte se usou outro e-mail na compra; se não, ofereça o curso pelo preço normal (buscar_produto).`;
  }
  return [
    `ALUNO CONFIRMADO (${r.fonte}${r.produtos.length ? `: ${r.produtos.slice(0, 3).join('; ')}` : ''}). Pode oferecer a condição de aluno:`,
    `${desconto.curso}: de ${desconto.de} por *${desconto.por}*${desconto.parcelado ? ` ou ${desconto.parcelado}` : ''}.`,
    `Link exclusivo: ${desconto.link}`,
    'Diga que é condição para quem já é aluno; não divulgue o link para terceiros.',
  ].join('\n');
}
