/**
 * Boas-vindas por WhatsApp: "acesso liberado" e "pedido recebido".
 *
 * POR QUE EXISTE: a maior reclamação dos alunos no chat é não conseguir entrar
 * na plataforma. Em 90 dias foram 180 conversas, e 5,3% das compras viraram um
 * chamado de acesso em até 7 dias. Em 88 de 99 casos com e-mail informado a
 * conta JÁ existia — a pessoa não sabia qual e-mail usou, não achou o e-mail de
 * boas-vindas ou não lembrava a senha. O acesso era comunicado uma vez, só por
 * e-mail, e só quando a Guru mandava `approved`. No boleto, nada era dito entre
 * "gerado" e "compensado".
 *
 * O QUE MANDA:
 *   acesso — a transação virou `approved`: matrícula ativa, o e-mail que serve
 *            de login, o botão da plataforma e o que fazer se não lembrar a
 *            senha. Sai na hora pelo webhook da Guru; o cron é a rede de segurança.
 *   pedido — boleto gerado (`billet_printed`/`waiting_payment` com `billet`):
 *            recebemos, o acesso sai sozinho quando compensar, link da 2ª via.
 *            PIX não entra: compensa em minutos e a mensagem chegaria depois.
 *
 * QUEM NÃO RECEBE:
 *   - parcela de assinatura (`invoice.type == 'cycle'` na Guru): a matrícula
 *     existe há meses; "seu acesso foi liberado" leria como erro.
 *   - quem já era aluno do mesmo produto (aprovado antes desta transação):
 *     renovação ou recompra, não é primeiro acesso.
 *   - produtos da Fagenius (Tecnólogo, Sequencial, Direito): matrícula pela
 *     secretaria e outra plataforma. Estão em `produtos_ignorados`.
 *
 * Por que template: fora da janela de 24h a Meta recusa texto livre (#131047).
 * Se a pessoa responde, a janela abre e o atendimento segue normal.
 */
import { supabaseAdmin } from '../supabase';
import { lerTudo } from '../paginado';
import { sendWhatsAppTemplate, textoDoTemplate } from './whatsapp';
import { createMessage } from './message';
import { findOrCreateConversation, updateConversation } from './conversation';
import { partesEmBrasilia } from '@/lib/timezone';

export type TipoBoasVindas = 'acesso' | 'pedido';

const STATUS_RESOLVIDO = ['approved', 'refunded', 'canceled', 'expired'];
const STATUS_BOLETO_GERADO = ['billet_printed', 'waiting_payment'];

export interface ResultadoBoasVindas {
  enviados: number;
  falhas: number;
  pulados: number;
  candidatos: number;
  motivo?: string;
}

interface Config {
  ativo: boolean;
  template_acesso: string | null;
  template_pedido: string | null;
  template_idioma: string;
  link_base: string;
  hora_inicio: number;
  hora_fim: number;
  max_por_execucao: number;
  janela_dias: number;
  historico_dias: number;
  produtos_ignorados: string[];
  /** Só transações gravadas a partir daqui. Nulo = qualquer uma dentro da janela. */
  iniciado_em: string | null;
}

const CONFIG_PADRAO: Config = {
  ativo: false,
  template_acesso: 'acesso_liberado',
  template_pedido: 'pedido_recebido',
  template_idioma: 'pt_BR',
  link_base: 'https://pagamento.monsterconcursos.com.br/invoice/',
  hora_inicio: 8,
  hora_fim: 22,
  max_por_execucao: 40,
  janela_dias: 3,
  historico_dias: 365,
  produtos_ignorados: ['Tecnologo', 'Tecnólogo', 'Sequencial', 'Direito', 'Alteração', 'Taxa'],
  iniciado_em: null,
};

interface LinhaVenda {
  transaction_id: string | null;
  status: string | null;
  sold_at: string;
  created_at: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  product_names: string | null;
  payment_method: string | null;
}

export interface Candidato {
  tipo: TipoBoasVindas;
  venda: LinhaVenda;
  /** Quando o evento aconteceu (a linha `approved` ou a do boleto foi gravada). */
  em: string;
}

/** "Maria Aparecida da Silva" -> "Maria". */
function primeiroNome(nome: string | null): string {
  const limpo = (nome || '').trim().split(/\s+/)[0] || '';
  if (!limpo) return 'tudo bem';
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

/** Só o primeiro produto: o template tem uma linha, não uma lista. */
function produtoCurto(nomes: string | null): string {
  const primeiro = (nomes || '').split(/\s*[,;|]\s*/)[0].trim();
  return primeiro.length > 60 ? primeiro.slice(0, 57) + '...' : primeiro || 'seu curso';
}

function chaveCompra(contactId: string | null, produto: string | null): string {
  return `${contactId ?? ''}::${(produto ?? '').trim().toLowerCase()}`;
}

/** Sem acento e em minúsculas: "Alteração" tem de casar com "Alteraça~o" gravado decomposto. */
function simplificar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function produtoIgnorado(produto: string | null, ignorados: string[]): boolean {
  const nome = simplificar(produto || '');
  return ignorados.some((i) => i && nome.includes(simplificar(i)));
}

/**
 * Lê o log por transação e devolve o que merece boas-vindas.
 *
 * `guru_sales` é um LOG: a mesma transação aparece várias vezes conforme muda
 * de status, às vezes com o mesmo `sold_at`. Por isso a leitura é por
 * `created_at` da linha, e o "quando" de cada candidato é a data em que a linha
 * decisiva foi gravada — não a data da compra, que no boleto pago dois dias
 * depois continua sendo a do pedido.
 */
export function candidatosDoLog(linhas: LinhaVenda[]): Candidato[] {
  const porTransacao = new Map<string, LinhaVenda[]>();
  for (const linha of linhas) {
    if (!linha.transaction_id) continue;
    const lista = porTransacao.get(linha.transaction_id) ?? [];
    lista.push(linha);
    porTransacao.set(linha.transaction_id, lista);
  }

  const saida: Candidato[] = [];
  for (const lista of porTransacao.values()) {
    lista.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const aprovada = lista.find((l) => l.status === 'approved');
    if (aprovada) {
      saida.push({ tipo: 'acesso', venda: aprovada, em: aprovada.created_at });
      continue;
    }
    const ultima = lista[lista.length - 1];
    const resolvida = lista.some((l) => STATUS_RESOLVIDO.includes(l.status || ''));
    const boleto = (ultima.payment_method || '').toLowerCase() === 'billet';
    if (!resolvida && boleto && STATUS_BOLETO_GERADO.includes(ultima.status || '')) {
      const primeiraDoBoleto = lista.find((l) => STATUS_BOLETO_GERADO.includes(l.status || '')) ?? ultima;
      saida.push({ tipo: 'pedido', venda: ultima, em: primeiraDoBoleto.created_at });
    }
  }
  return saida.sort((a, b) => new Date(a.em).getTime() - new Date(b.em).getTime());
}

/**
 * Pergunta à Guru se esta cobrança é parcela de assinatura.
 *
 * `invoice.type === 'cycle'` é o único sinal que separa "parcela 3 de 12 de um
 * aluno antigo" de "matrícula nova" — `guru_sales` grava os dois igual. Sem
 * token ou com a API fora do ar devolve `null`; quem chama NÃO decide com isso:
 * solta a reserva e tenta na próxima rodada.
 */
async function ehParcelaDeAssinatura(transactionId: string | null): Promise<boolean | null> {
  const token = process.env.DIGITAL_GURU_USER_TOKEN;
  if (!token || !transactionId) return null;
  try {
    const resposta = await fetch(`https://digitalmanager.guru/api/v2/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { invoice?: { type?: string } };
    return dados?.invoice?.type === 'cycle';
  } catch (err) {
    console.error('[Boas-vindas] falha ao consultar a Guru:', err);
    return null;
  }
}

/**
 * (contato, produto) -> data da primeira compra aprovada, numa janela longa.
 * Serve para saber se ESTA transação é a primeira do produto ou uma recompra.
 */
async function primeirasCompras(dias: number): Promise<Map<string, number>> {
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();
  // Paginado, e não `.limit()`: o PostgREST corta em 1.000 linhas e devolveria
  // só as compras mais antigas da janela — com isso toda recompra recente passa
  // por primeira compra, e um aluno de meses recebe "bem-vindo". Ver `lerTudo`.
  const data = await lerTudo<Pick<LinhaVenda, 'contact_id' | 'product_names' | 'sold_at'>>((de, ate) =>
    supabaseAdmin
      .from('guru_sales')
      .select('contact_id, product_names, status, sold_at')
      .eq('status', 'approved')
      .gte('sold_at', desde)
      .order('sold_at', { ascending: true })
      .range(de, ate)
  );
  const primeira = new Map<string, number>();
  for (const linha of data) {
    if (!linha.contact_id) continue;
    const k = chaveCompra(linha.contact_id, linha.product_names);
    const t = new Date(linha.sold_at).getTime();
    const atual = primeira.get(k);
    if (atual === undefined || t < atual) primeira.set(k, t);
  }
  return primeira;
}

/** Já era aluno se existe compra aprovada do mesmo produto mais de 1 dia antes desta. */
export function jaEraAluno(
  venda: Pick<LinhaVenda, 'contact_id' | 'product_names' | 'sold_at'>,
  primeiras: Map<string, number>
): boolean {
  const t = primeiras.get(chaveCompra(venda.contact_id, venda.product_names));
  if (t === undefined) return false;
  return t < new Date(venda.sold_at).getTime() - 86400_000;
}

/**
 * A partir de quando uma transação conta: o mais recente entre a janela e o
 * `iniciado_em`. Sem isso, ligar a régua mandaria "acesso liberado" para quem
 * comprou há dois dias — na simulação de 22/09/2026 eram 77 pessoas de uma vez.
 */
export function limiteDaJanela(cfg: Pick<Config, 'janela_dias' | 'iniciado_em'>): number {
  const janela = Date.now() - cfg.janela_dias * 86400_000;
  const inicio = cfg.iniciado_em ? new Date(cfg.iniciado_em).getTime() : 0;
  return Math.max(janela, inicio);
}

async function lerConfig(): Promise<Config> {
  const { data } = await supabaseAdmin.from('boas_vindas_config').select('*').limit(1).maybeSingle();
  return { ...CONFIG_PADRAO, ...((data as Partial<Config> | null) ?? {}) };
}

async function lerLog(janelaDias: number, apenasTransacao?: string): Promise<LinhaVenda[]> {
  const desde = new Date(Date.now() - janelaDias * 86400_000).toISOString();
  return lerTudo<LinhaVenda>((de, ate) => {
    const consulta = supabaseAdmin
      .from('guru_sales')
      .select(
        'transaction_id, status, sold_at, created_at, contact_id, contact_name, contact_phone, contact_email, product_names, payment_method'
      )
      .order('created_at', { ascending: true })
      .range(de, ate);
    return apenasTransacao
      ? consulta.eq('transaction_id', apenasTransacao)
      : consulta.gte('created_at', desde);
  });
}

/**
 * Manda o que estiver pendente. Com `apenasTransacao`, olha só aquela — é o
 * que o webhook da Guru chama logo depois de gravar a venda, para o aviso
 * chegar em segundos e não na próxima hora.
 */
export async function enviarBoasVindas(opcoes: { apenasTransacao?: string } = {}): Promise<ResultadoBoasVindas> {
  const vazio = { enviados: 0, falhas: 0, pulados: 0, candidatos: 0 };
  const cfg = await lerConfig();

  if (!cfg.ativo) return { ...vazio, motivo: 'boas-vindas desligadas' };
  if (!cfg.template_acesso && !cfg.template_pedido) return { ...vazio, motivo: 'nenhum template configurado' };

  const agora = partesEmBrasilia();
  if (agora.hora < cfg.hora_inicio || agora.hora >= cfg.hora_fim) {
    return { ...vazio, motivo: `fora do horário (${cfg.hora_inicio}h–${cfg.hora_fim}h)` };
  }

  const { data: canal } = await supabaseAdmin
    .from('channels')
    .select('id, external_id, access_token, business_account_id')
    .eq('type', 'whatsapp')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!canal?.access_token || !canal.external_id) {
    return { ...vazio, motivo: 'canal de WhatsApp sem token' };
  }

  let linhas: LinhaVenda[];
  try {
    linhas = await lerLog(cfg.janela_dias, opcoes.apenasTransacao);
  } catch (err) {
    console.error('[Boas-vindas] falha ao ler guru_sales:', err);
    return { ...vazio, motivo: 'falha ao ler as vendas' };
  }

  const limite = limiteDaJanela(cfg);
  const candidatos = candidatosDoLog(linhas).filter(
    (c) => c.venda.contact_id && c.venda.contact_phone && new Date(c.em).getTime() >= limite
  );

  const primeiras = await primeirasCompras(cfg.historico_dias);

  // Duas compras no mesmo dia (dois cursos) não viram duas mensagens iguais.
  const ontem = new Date(Date.now() - 86400_000).toISOString();
  const { data: recentes } = await supabaseAdmin
    .from('boas_vindas_envios')
    .select('contact_id, tipo')
    .eq('status', 'sent')
    .gte('created_at', ontem);
  const abordadoHoje = new Set((recentes ?? []).map((r) => `${r.contact_id}:${r.tipo}`));

  let enviados = 0;
  let falhas = 0;
  let pulados = 0;

  for (const { tipo, venda } of candidatos) {
    if (enviados >= cfg.max_por_execucao) break;
    if (abordadoHoje.has(`${venda.contact_id}:${tipo}`)) continue;

    // Reserva primeiro: a unique é o que serializa webhook e cron.
    const { error: reservaErro } = await supabaseAdmin.from('boas_vindas_envios').insert({
      transaction_id: venda.transaction_id,
      tipo,
      contact_id: venda.contact_id,
      produto: venda.product_names,
      email: venda.contact_email,
      metodo: venda.payment_method,
      status: 'sent',
    });
    if (reservaErro) {
      if (reservaErro.code !== '23505') console.error('[Boas-vindas] falha ao reservar:', reservaErro);
      continue;
    }

    const atualizar = (campos: Record<string, unknown>) =>
      supabaseAdmin
        .from('boas_vindas_envios')
        .update(campos)
        .eq('transaction_id', venda.transaction_id)
        .eq('tipo', tipo);
    const pular = async (motivo: string) => {
      await atualizar({ status: 'skipped', motivo });
      pulados++;
    };
    const soltar = async () => {
      // Sem resposta da Guru não dá para saber se é parcela. Solta a reserva e
      // a próxima rodada tenta de novo — calar agora não é decidir.
      await supabaseAdmin
        .from('boas_vindas_envios')
        .delete()
        .eq('transaction_id', venda.transaction_id)
        .eq('tipo', tipo);
      falhas++;
    };

    const template = tipo === 'acesso' ? cfg.template_acesso : cfg.template_pedido;
    if (!template) {
      await pular('sem_template');
      continue;
    }
    if (produtoIgnorado(venda.product_names, cfg.produtos_ignorados)) {
      await pular('produto_ignorado');
      continue;
    }
    if (jaEraAluno(venda, primeiras)) {
      await pular('ja_era_aluno');
      continue;
    }
    const parcela = await ehParcelaDeAssinatura(venda.transaction_id);
    if (parcela === null) {
      await soltar();
      continue;
    }
    if (parcela) {
      await pular('parcela_de_assinatura');
      continue;
    }

    const parametros =
      tipo === 'acesso'
        ? [primeiroNome(venda.contact_name), produtoCurto(venda.product_names), venda.contact_email || 'da compra']
        : [primeiroNome(venda.contact_name), produtoCurto(venda.product_names)];

    try {
      const envio = await sendWhatsAppTemplate({
        phoneNumberId: canal.external_id,
        accessToken: canal.access_token,
        to: venda.contact_phone!,
        template,
        idioma: cfg.template_idioma,
        parametros,
        // O `pedido` leva a 2ª via do boleto; o `acesso` tem botão de URL fixa.
        botaoUrlSufixo: tipo === 'pedido' ? venda.transaction_id || undefined : undefined,
      });

      const conversa = await findOrCreateConversation({ channelId: canal.id, contactId: venda.contact_id! });
      const externalId = envio.messages?.[0]?.id;
      const rotulo =
        tipo === 'acesso' ? '🤖 Boas-vindas: acesso liberado' : '🤖 Boas-vindas: pedido recebido (boleto)';

      // Na conversa fica o texto que a pessoa leu, não um rótulo: quem abre o
      // inbox para atender precisa ver a mensagem. O rótulo só entra se a Meta
      // não devolver o corpo do template.
      const texto = await textoDoTemplate({
        wabaId: canal.business_account_id,
        accessToken: canal.access_token,
        nome: template,
        idioma: cfg.template_idioma,
        parametros,
      });
      const preview = texto ?? rotulo;

      await createMessage({
        conversationId: conversa.id,
        direction: 'outbound',
        senderType: 'bot',
        contentType: 'template',
        body: preview,
        externalId,
        status: 'sent',
        metadata: {
          via: 'boas_vindas',
          tipo,
          transaction_id: venda.transaction_id,
          template,
          produto: venda.product_names,
          email: venda.contact_email,
          metodo: venda.payment_method,
          link: tipo === 'pedido' ? `${cfg.link_base}${venda.transaction_id}` : null,
        },
      });
      await updateConversation(conversa.id, {
        lastMessageAt: new Date().toISOString(),
        lastMessagePreview: preview,
      });
      await atualizar({ conversation_id: conversa.id, external_id: externalId });

      abordadoHoje.add(`${venda.contact_id}:${tipo}`);
      enviados++;
    } catch (err) {
      falhas++;
      const detalhe =
        (err as { response?: { data?: unknown } })?.response?.data ?? (err instanceof Error ? err.message : 'erro');
      console.error('[Boas-vindas] falha ao enviar:', detalhe);
      // Fica como falha e não volta: um número que a Meta recusa vai recusar de novo.
      await atualizar({ status: 'failed', erro: JSON.stringify(detalhe).slice(0, 500) });
    }
  }

  console.log('[Boas-vindas]', { candidatos: candidatos.length, enviados, pulados, falhas });
  return { enviados, falhas, pulados, candidatos: candidatos.length };
}

/**
 * O que sairia agora, sem mandar nada. Aplica os mesmos filtros do envio,
 * menos a consulta à Guru (que é por transação e custaria uma chamada cada).
 */
export async function simularBoasVindas(): Promise<{
  candidatos: Array<{
    tipo: TipoBoasVindas;
    produto: string;
    email: string | null;
    metodo: string | null;
    horas: number;
    pularPor: string | null;
  }>;
  enviaria: number;
  config: Pick<Config, 'ativo' | 'iniciado_em' | 'janela_dias' | 'template_acesso' | 'template_pedido' | 'produtos_ignorados'>;
}> {
  const cfg = await lerConfig();
  const linhas = await lerLog(cfg.janela_dias);
  const { data: jaEnviados } = await supabaseAdmin
    .from('boas_vindas_envios')
    .select('transaction_id, tipo');
  const feito = new Set((jaEnviados ?? []).map((e) => `${e.transaction_id}:${e.tipo}`));
  const primeiras = await primeirasCompras(cfg.historico_dias);
  const limite = limiteDaJanela(cfg);

  const candidatos = candidatosDoLog(linhas)
    .filter((c) => c.venda.contact_id && c.venda.contact_phone && new Date(c.em).getTime() >= limite)
    .filter((c) => !feito.has(`${c.venda.transaction_id}:${c.tipo}`))
    .map(({ tipo, venda, em }) => {
      const template = tipo === 'acesso' ? cfg.template_acesso : cfg.template_pedido;
      const pularPor = !template
        ? 'sem_template'
        : produtoIgnorado(venda.product_names, cfg.produtos_ignorados)
          ? 'produto_ignorado'
          : jaEraAluno(venda, primeiras)
            ? 'ja_era_aluno'
            : null;
      return {
        tipo,
        produto: produtoCurto(venda.product_names),
        email: venda.contact_email,
        metodo: venda.payment_method,
        horas: Math.round((Date.now() - new Date(em).getTime()) / 3600_000),
        pularPor,
      };
    });

  return {
    candidatos,
    enviaria: candidatos.filter((c) => !c.pularPor).length,
    // A configuração em vigor, para a prévia ser lida junto com as regras que a geraram.
    config: {
      ativo: cfg.ativo,
      iniciado_em: cfg.iniciado_em,
      janela_dias: cfg.janela_dias,
      template_acesso: cfg.template_acesso,
      template_pedido: cfg.template_pedido,
      produtos_ignorados: cfg.produtos_ignorados,
    },
  };
}
