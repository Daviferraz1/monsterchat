/**
 * Mensagens rápidas da caixa de mensagem (botão ⚡ ou "/" no início do texto).
 *
 * Quatro fontes, num formato só:
 *  - Equipe: textos que se repetem (garantia, dispensa, acesso…), editados em
 *    Config. › IA › Respostas rápidas e guardados em ia_settings.
 *  - Cursos: a mesma apresentação que a IA usa (formatSalesPitch).
 *  - Editais: o PDF oficial e a lista de matérias, da base concurso_kb.
 *  - Deste aluno: boleto/PIX em aberto, com o link da fatura.
 *
 * `{nome}` no texto vira o primeiro nome do contato na hora de inserir (no navegador).
 */
import { supabaseAdmin } from '../supabase';
import { listProducts, type ProductRow } from './catalog';
import { OPENING_SCRIPT, courseLabel, formatPriceLine, formatSalesPitch, salesLinkWithUtm, semTravessao } from './team-templates';
import { pendentesDoLog } from '../services/recuperacao-pagamento';

export interface MensagemRapida {
  id: string;
  titulo: string;
  grupo: 'Deste aluno' | 'Equipe' | 'Cursos Monster' | 'Cursos Fagenius' | 'Editais';
  /** Palavras extras para a busca (concurso, cargo, slug). */
  busca: string;
  texto: string;
}

export interface RespostaEquipe {
  id: string;
  titulo: string;
  texto: string;
}

const CHAVE_EQUIPE = 'respostas_rapidas';

/** Ponto de partida, com as regras que já valem no atendimento. A equipe edita no admin. */
export const RESPOSTAS_INICIAIS: RespostaEquipe[] = [
  {
    id: 'abertura',
    titulo: 'Abertura (qual o seu objetivo?)',
    texto: OPENING_SCRIPT.replace(/^Olá! 🚀/, 'Olá, {nome}! 🚀'),
  },
  {
    id: 'reembolso',
    titulo: 'Reembolso / garantia',
    texto:
      '{nome}, para solicitar o reembolso é só enviar um e-mail para atendimento@monsterconcursos.com.br com seu nome, CPF, o e-mail usado na compra e o motivo. O prazo para pedir é de até 7 dias após a compra, conforme o Código de Defesa do Consumidor (Art. 49), e nossa equipe responde em até 5 dias úteis.',
  },
  {
    id: 'acesso',
    titulo: 'Não recebi o acesso',
    texto:
      '{nome}, o acesso é enviado para o e-mail usado na compra. Dá uma olhada na caixa de entrada, no spam e na aba Promoções. Se não encontrar, me passa o e-mail da compra que eu confiro aqui pra você 😊',
  },
  {
    id: 'pagamento',
    titulo: 'Formas de pagamento',
    texto:
      'Você pode pagar por PIX, boleto ou cartão de crédito. No cartão dá para parcelar; PIX e boleto são à vista (não temos boleto parcelado).',
  },
  {
    id: 'dispensa',
    titulo: 'Dispensa de disciplina (Tecnólogo)',
    texto:
      '{nome}, depois da matrícula você pode abrir uma solicitação de dispensa de disciplina pelo portal do aluno. Cada pedido é analisado individualmente pela coordenação, então não há garantia de quais disciplinas serão dispensadas. E a dispensa não reduz o tempo do curso: o Tecnólogo continua com duração de 1 ano e 6 meses.',
  },
  {
    id: 'sequencial-pcmg',
    titulo: 'Sequencial não vale para a PCMG',
    texto:
      '{nome}, para a Polícia Civil de MG (Investigador e Escrivão) o Sequencial não é aceito: o cargo exige graduação de nível superior. Nesse caso o caminho é o Tecnólogo em Gestão Pública, que é graduação e atende ao requisito. O Sequencial é aceito para o Soldado da PMMG.',
  },
];

export async function lerRespostasEquipe(): Promise<RespostaEquipe[]> {
  const { data } = await supabaseAdmin.from('ia_settings').select('value').eq('key', CHAVE_EQUIPE).maybeSingle();
  const itens = (data?.value as { itens?: RespostaEquipe[] } | null)?.itens;
  return Array.isArray(itens) ? itens : RESPOSTAS_INICIAIS;
}

export async function gravarRespostasEquipe(itens: RespostaEquipe[]): Promise<void> {
  const { error } = await supabaseAdmin.from('ia_settings').upsert({ key: CHAVE_EQUIPE, value: { itens } }, { onConflict: 'key' });
  if (error) throw error;
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

async function mensagensCursos(): Promise<MensagemRapida[]> {
  const produtos = await listProducts({ is_active: true, status: 'available' });
  const vistos = new Set<string>();
  const out: MensagemRapida[] = [];
  for (const p of produtos) {
    const titulo = courseLabel(p);
    // O catálogo tem cursos repetidos (ex.: Ipatinga duas vezes); fica o primeiro.
    if (vistos.has(titulo.toLowerCase())) continue;
    const texto = p.brand === 'fagenius' ? apresentacaoFagenius(p) : formatSalesPitch(p, 'rapida');
    if (!texto) continue;
    vistos.add(titulo.toLowerCase());
    out.push({
      id: `curso:${p.id}`,
      titulo,
      grupo: p.brand === 'fagenius' ? 'Cursos Fagenius' : 'Cursos Monster',
      busca: [p.slug, p.target_exam, p.target_role, p.category].filter(Boolean).join(' '),
      texto,
    });
  }
  return out;
}

interface LinhaKb {
  ref: string;
  titulo: string;
  orgao: string | null;
  uf: string | null;
  cargo: string | null;
  url: string | null;
  cp?: Array<{ disciplina?: string }> | null;
}

function norm(t: string | null | undefined): string {
  return (t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Editais da edição atual. O link é SEMPRE o do edital curado (`fonte = edital`,
 * PDF guardado no nosso storage): a ficha aponta para onde o monitor achou o PDF,
 * às vezes a cópia de um cursinho, e isso não vai para aluno.
 */
async function mensagensEditais(): Promise<MensagemRapida[]> {
  const [{ data: editais }, { data: fichas }] = await Promise.all([
    supabaseAdmin
      .from('concurso_kb')
      .select('ref, titulo, orgao, uf, cargo, url')
      .eq('fonte', 'edital')
      .eq('edicao', 'atual')
      .not('url', 'is', null),
    supabaseAdmin
      .from('concurso_kb')
      .select('ref, titulo, orgao, uf, cargo, url, cp:dados->conteudo_programatico')
      .eq('fonte', 'ficha')
      .eq('edicao', 'atual'),
  ]);

  const out: MensagemRapida[] = [];
  const editaisPorOrgao = new Map<string, LinhaKb>();
  for (const e of (editais ?? []) as LinhaKb[]) {
    editaisPorOrgao.set(norm(e.orgao), e);
    const nome = e.titulo.replace(/^Edital\s+/i, '');
    out.push({
      id: `edital:${e.ref}`,
      titulo: `📄 Edital — ${nome}`,
      grupo: 'Editais',
      busca: [e.orgao, e.cargo, e.uf].filter(Boolean).join(' '),
      texto: `Segue o edital oficial do concurso ${e.orgao ?? nome}${e.cargo ? ` (${e.cargo})` : ''}:\n${e.url}`,
    });
  }

  for (const f of (fichas ?? []) as LinhaKb[]) {
    const disciplinas = [...new Set((f.cp ?? []).map((c) => c.disciplina?.trim()).filter(Boolean))] as string[];
    if (!disciplinas.length) continue;
    const oficial = editaisPorOrgao.get(norm(f.orgao));
    const nome = f.titulo.replace(/^Ficha do edital\s+—\s+/i, '');
    const linhas = [`Matérias cobradas no edital ${nome}:`, '', ...disciplinas.slice(0, 30).map((d) => `✅ ${d}`)];
    if (oficial?.url) linhas.push('', `Edital completo: ${oficial.url}`);
    out.push({
      id: `materias:${f.ref}`,
      titulo: `📚 Matérias — ${nome}`,
      grupo: 'Editais',
      busca: ['conteudo programatico materias disciplinas', f.orgao, f.cargo, f.uf].filter(Boolean).join(' '),
      texto: linhas.join('\n'),
    });
  }
  return out;
}

let cacheGeral: { em: number; itens: MensagemRapida[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/** Equipe + cursos + editais. O mesmo para todo atendente; fica 5 minutos em memória. */
export async function mensagensGerais(forcar = false): Promise<MensagemRapida[]> {
  if (!forcar && cacheGeral && Date.now() - cacheGeral.em < CACHE_MS) return cacheGeral.itens;
  const [equipe, cursos, editais] = await Promise.all([
    lerRespostasEquipe(),
    mensagensCursos(),
    mensagensEditais().catch(() => [] as MensagemRapida[]),
  ]);
  const itens: MensagemRapida[] = [
    ...equipe.map((r) => ({ id: `equipe:${r.id}`, titulo: r.titulo, grupo: 'Equipe' as const, busca: '', texto: r.texto })),
    ...cursos.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.titulo.localeCompare(b.titulo, 'pt-BR')),
    ...editais.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')),
  ];
  // Texto que vai para o aluno sem travessão; o título, que só o atendente vê, fica como está.
  for (const m of itens) m.texto = semTravessao(m.texto);
  cacheGeral = { em: Date.now(), itens };
  return itens;
}

export function limparCacheMensagens(): void {
  cacheGeral = null;
}

const LINK_FATURA = 'https://pagamento.monsterconcursos.com.br/invoice/';
const METODO: Record<string, string> = { billet: 'boleto', pix: 'PIX', credit_card: 'pagamento no cartão' };

/**
 * Boleto/PIX em aberto do contato desta conversa (últimos 30 dias), com o link da
 * fatura, o mesmo que a régua de recuperação manda. Checkout abandonado não tem
 * fatura, então fica de fora.
 */
export async function mensagensDoAluno(conversationId: string): Promise<MensagemRapida[]> {
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('contact_id, contact:contacts(email)')
    .eq('id', conversationId)
    .maybeSingle();
  const contactId = conv?.contact_id as string | undefined;
  if (!contactId) return [];
  const email = ((conv?.contact as { email?: string | null } | null)?.email ?? '').trim();

  const desde = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const colunas =
    'id, transaction_id, status, sold_at, created_at, contact_id, contact_name, contact_phone, product_names, payment_method, payment_total';
  const [porContato, porEmail] = await Promise.all([
    supabaseAdmin.from('guru_sales').select(colunas).gte('sold_at', desde).eq('contact_id', contactId),
    email
      ? supabaseAdmin.from('guru_sales').select(colunas).gte('sold_at', desde).ilike('contact_email', email)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  // Sem duplicar linha que bate pelos dois lados; pendentesDoLog quer ordem de gravação.
  const unicas = new Map<string, NonNullable<typeof porContato.data>[number]>();
  for (const l of [...(porContato.data ?? []), ...(porEmail.data ?? [])]) unicas.set(String(l.id), l);
  const linhas = [...unicas.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (!linhas.length) return [];

  // Já pagou o mesmo produto em outra transação? Então não cobra de novo.
  const pagos = new Set(linhas.filter((l) => l.status === 'approved').map((l) => (l.product_names ?? '').toLowerCase()));
  return pendentesDoLog(linhas)
    .filter((p) => p.status !== 'abandoned' && !pagos.has((p.product_names ?? '').toLowerCase()))
    .reverse()
    .map((p) => {
      const metodo = METODO[p.payment_method ?? ''] ?? 'pagamento';
      const valor = p.payment_total != null ? ` (R$ ${p.payment_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` : '';
      const produto = semTravessao((p.product_names ?? 'seu curso').split(/\s*[,;|]\s*/)[0]);
      return {
        id: `fatura:${p.transaction_id}`,
        titulo: `💳 ${metodo[0].toUpperCase()}${metodo.slice(1)} em aberto — ${produto}${valor}`,
        grupo: 'Deste aluno' as const,
        busca: 'pagamento pendente boleto pix fatura',
        texto: `{nome}, vi aqui que o seu ${metodo}${valor ? ` de${valor.replace(/[()]/g, '')}` : ''} (${produto}) ainda está em aberto. Segue o link para finalizar o pagamento:\n${LINK_FATURA}${p.transaction_id}\n\nQualquer dúvida, estou por aqui! 😊`,
      };
    });
}
