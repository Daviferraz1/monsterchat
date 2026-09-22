/**
 * Onboarding pós-compra: uma única mensagem, e só para quem não entrou.
 *
 * POR QUE EXISTE: na análise dos 75 reembolsos de 120 dias (22/09/2026), 89%
 * dos pedidos vieram dentro dos 7 dias de garantia, com mediana de 4 dias, e
 * 43% diziam a mesma coisa — "não me adaptei", "não sabia por onde começar",
 * "plataforma confusa".
 *
 * O caminho principal para resolver isso é dentro da plataforma (o bloco de
 * primeiros passos na home do aluno). Aqui fica só a rede de segurança: quem
 * comprou e, três dias depois, não abriu nenhuma aula não vai ser alcançado por
 * nada que esteja dentro da plataforma — esse é o único caso em que uma
 * mensagem de fora se justifica.
 *
 * QUEM NÃO RECEBE: quem já começou a estudar (a maioria), quem pediu reembolso ou
 * cancelou, quem já está conversando com a equipe, produto da Fagenius e
 * compra anterior a `iniciado_em`. Quando não dá para saber se o aluno entrou,
 * também não manda: calar é mais barato que incomodar.
 *
 * Por que template: fora da janela de 24h a Meta recusa texto livre (#131047).
 */
import { supabaseAdmin } from '../supabase';
import { lerTudo } from '../paginado';
import { sendWhatsAppTemplate, textoDoTemplate } from './whatsapp';
import { createMessage } from './message';
import { findOrCreateConversation, updateConversation } from './conversation';
import { criarLinkAcesso } from './acesso-direto';
import { naoComecouAEstudar } from '../integrations/platform-access';
import { partesEmBrasilia } from '@/lib/timezone';

export type EtapaOnboarding = 'dia3';

interface Config {
  ativo: boolean;
  template_dia3: string | null;
  template_idioma: string;
  horas_dia3: number;
  tolerancia_horas: number;
  hora_inicio: number;
  hora_fim: number;
  max_por_execucao: number;
  produtos_ignorados: string[];
  iniciado_em: string | null;
  link_acesso_validade_dias: number;
}

const CONFIG_PADRAO: Config = {
  ativo: false,
  template_dia3: 'onboarding_dia3',
  template_idioma: 'pt_BR',
  horas_dia3: 72,
  tolerancia_horas: 36,
  hora_inicio: 9,
  hora_fim: 20,
  max_por_execucao: 40,
  produtos_ignorados: ['Tecnologo', 'Tecnólogo', 'Sequencial', 'Direito', 'Alteração', 'Taxa'],
  iniciado_em: null,
  link_acesso_validade_dias: 7,
};

interface Venda {
  transaction_id: string | null;
  status: string | null;
  sold_at: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  product_names: string | null;
}

export interface ResultadoOnboarding {
  enviados: number;
  falhas: number;
  pulados: number;
  candidatos: number;
  motivo?: string;
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

export function produtoIgnorado(nomes: string | null, lista: string[]): boolean {
  const alvo = (nomes || '').toLowerCase();
  return lista.some((p) => alvo.includes(p.toLowerCase()));
}

/**
 * A etapa está na hora quando a compra tem entre `horas` e `horas + tolerância`.
 * A tolerância evita que uma fila represada (pane, cron parado) dispare hoje a
 * mensagem de uma compra de duas semanas atrás.
 */
export function naHora(soldAt: string, horas: number, tolerancia: number, agora = Date.now()): boolean {
  const idade = (agora - new Date(soldAt).getTime()) / 3_600_000;
  return idade >= horas && idade < horas + tolerancia;
}

async function lerConfig(): Promise<Config> {
  const { data } = await supabaseAdmin.from('onboarding_config').select('*').limit(1).maybeSingle();
  return { ...CONFIG_PADRAO, ...((data as Partial<Config> | null) ?? {}) };
}

/** Compras aprovadas dos últimos dias, com o contato já resolvido. */
async function lerVendas(dias: number): Promise<Venda[]> {
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();
  return lerTudo<Venda>((de, ate) =>
    supabaseAdmin
      .from('guru_sales')
      .select('transaction_id, status, sold_at, contact_id, contact_name, contact_phone, contact_email, product_names')
      .eq('status', 'approved')
      .gte('sold_at', desde)
      .order('sold_at', { ascending: true })
      .range(de, ate)
  );
}

/**
 * Transações que deixaram de valer: reembolso, cancelamento ou estorno gravados
 * depois da aprovação. Quem pediu o dinheiro de volta não recebe dica de estudo.
 */
async function transacoesEncerradas(dias: number): Promise<Set<string>> {
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();
  const linhas = await lerTudo<{ transaction_id: string | null; status: string | null }>((de, ate) =>
    supabaseAdmin
      .from('guru_sales')
      .select('transaction_id, status')
      .in('status', ['refunded', 'canceled', 'chargeback', 'expired'])
      .gte('sold_at', desde)
      .range(de, ate)
  );
  return new Set(linhas.map((l) => l.transaction_id).filter((t): t is string => Boolean(t)));
}

/**
 * Contatos que mandaram mensagem depois da compra. Se a pessoa está conversando
 * com a equipe, o robô fica quieto: o atendimento humano resolve melhor e a
 * mensagem automática em cima da conversa é o tipo de coisa que gera print no
 * Instagram.
 */
async function contatosFalando(ids: string[], dias: number): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();
  const falando = new Set<string>();
  // `messages` não guarda o contato: quem sabe de quem é a conversa é
  // `conversations`. Filtra pelos contatos da fila (em lotes, para a URL não
  // estourar) em vez de ler o inbox inteiro — são ~2.000 mensagens por semana.
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('id, conversations!inner(contact_id)')
      .eq('direction', 'inbound')
      .gte('created_at', desde)
      .in('conversations.contact_id', lote);
    if (error) {
      console.error('[Onboarding] falha ao ler conversas em andamento:', error);
      continue;
    }
    for (const linha of data ?? []) {
      // O tipo gerado diz array e o PostgREST devolve objeto nesta relação
      // (muitos-para-um). Aceita os dois em vez de apostar em um.
      const conversa = (linha as { conversations?: unknown }).conversations;
      const alvo = Array.isArray(conversa) ? conversa[0] : conversa;
      const id = (alvo as { contact_id?: string | null } | undefined)?.contact_id;
      if (id) falando.add(id);
    }
  }
  return falando;
}

interface Candidato {
  etapa: EtapaOnboarding;
  venda: Venda;
}

/** O que está na hora de sair, na ordem em que as compras aconteceram. */
export function candidatos(vendas: Venda[], cfg: Config, agora = Date.now()): Candidato[] {
  const inicio = cfg.iniciado_em ? new Date(cfg.iniciado_em).getTime() : 0;
  const saida: Candidato[] = [];
  for (const venda of vendas) {
    if (!venda.transaction_id || !venda.contact_id || !venda.contact_phone) continue;
    if (new Date(venda.sold_at).getTime() < inicio) continue;
    if (naHora(venda.sold_at, cfg.horas_dia3, cfg.tolerancia_horas, agora)) saida.push({ etapa: 'dia3', venda });
  }
  return saida;
}

export async function enviarOnboarding(): Promise<ResultadoOnboarding> {
  const vazio = { enviados: 0, falhas: 0, pulados: 0, candidatos: 0 };
  const cfg = await lerConfig();

  if (!cfg.ativo) return { ...vazio, motivo: 'onboarding desligado' };
  if (!cfg.template_dia3) return { ...vazio, motivo: 'nenhum template configurado' };

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

  // A janela precisa cobrir a etapa mais tardia mais a tolerância.
  const janelaDias = Math.ceil((cfg.horas_dia3 + cfg.tolerancia_horas) / 24) + 1;
  const [vendas, encerradas] = await Promise.all([lerVendas(janelaDias), transacoesEncerradas(janelaDias)]);

  const fila = candidatos(vendas, cfg);
  const falando = await contatosFalando(
    [...new Set(fila.map((c) => c.venda.contact_id!).filter(Boolean))],
    janelaDias
  );
  let enviados = 0;
  let falhas = 0;
  let pulados = 0;

  for (const { etapa, venda } of fila) {
    if (enviados >= cfg.max_por_execucao) break;

    const template = cfg.template_dia3;
    if (!template) continue;

    // Reserva primeiro: a unique (transaction_id, tipo) é o que impede duas
    // rodadas do cron mandarem a mesma mensagem duas vezes.
    const { error: reservaErro } = await supabaseAdmin.from('boas_vindas_envios').insert({
      transaction_id: venda.transaction_id,
      tipo: etapa,
      contact_id: venda.contact_id,
      produto: venda.product_names,
      email: venda.contact_email,
      status: 'sent',
    });
    if (reservaErro) {
      if (reservaErro.code !== '23505') console.error('[Onboarding] falha ao reservar:', reservaErro);
      continue;
    }

    const atualizar = (campos: Record<string, unknown>) =>
      supabaseAdmin
        .from('boas_vindas_envios')
        .update(campos)
        .eq('transaction_id', venda.transaction_id)
        .eq('tipo', etapa);
    const pular = async (motivo: string) => {
      await atualizar({ status: 'skipped', motivo });
      pulados++;
    };

    if (encerradas.has(venda.transaction_id!)) {
      await pular('reembolsado_ou_cancelado');
      continue;
    }
    if (produtoIgnorado(venda.product_names, cfg.produtos_ignorados)) {
      await pular('produto_ignorado');
      continue;
    }
    if (falando.has(venda.contact_id!)) {
      await pular('conversa_em_andamento');
      continue;
    }
    if (!venda.contact_email) {
      await pular('sem_email');
      continue;
    }
    // O ponto da régua: quem já começou a estudar está sendo atendido pelo bloco
    // de primeiros passos, dentro da plataforma. `null` é "não sei" e também cala.
    if ((await naoComecouAEstudar(venda.contact_email)) !== true) {
      await pular('ja_comecou');
      continue;
    }

    // O botão leva para dentro da plataforma sem senha: é o atalho que resolve
    // a queixa "não consegui entrar", que é a origem de boa parte dos reembolsos.
    const link = await criarLinkAcesso({
      email: venda.contact_email,
      contactId: venda.contact_id!,
      origem: 'onboarding',
      transactionId: venda.transaction_id!,
      validadeDias: cfg.link_acesso_validade_dias,
    });
    if (!link.ok) {
      falhas++;
      await atualizar({ status: 'failed', erro: link.message });
      continue;
    }

    const parametros = [primeiroNome(venda.contact_name), produtoCurto(venda.product_names)];

    try {
      const envio = await sendWhatsAppTemplate({
        phoneNumberId: canal.external_id,
        accessToken: canal.access_token,
        to: venda.contact_phone!,
        template,
        idioma: cfg.template_idioma,
        parametros,
        botaoUrlSufixo: link.codigo,
      });

      const conversa = await findOrCreateConversation({ channelId: canal.id, contactId: venda.contact_id! });
      const externalId = envio.messages?.[0]?.id;
      const texto = await textoDoTemplate({
        wabaId: canal.business_account_id,
        accessToken: canal.access_token,
        nome: template,
        idioma: cfg.template_idioma,
        parametros,
        botaoUrlSufixo: link.codigo,
      });
      const preview = texto ?? `🤖 Onboarding ${etapa}`;

      await createMessage({
        conversationId: conversa.id,
        direction: 'outbound',
        senderType: 'bot',
        contentType: 'template',
        body: preview,
        externalId,
        status: 'sent',
        metadata: {
          via: 'onboarding',
          etapa,
          transaction_id: venda.transaction_id,
          template,
          produto: venda.product_names,
          link_acesso: link.codigo,
        },
      });
      await updateConversation(conversa.id, {
        lastMessageAt: new Date().toISOString(),
        lastMessagePreview: preview,
      });
      await atualizar({ conversation_id: conversa.id, external_id: externalId });
      enviados++;
    } catch (err) {
      falhas++;
      const detalhe =
        (err as { response?: { data?: unknown } })?.response?.data ?? (err instanceof Error ? err.message : 'erro');
      console.error('[Onboarding] falha ao enviar:', detalhe);
      await atualizar({ status: 'failed', erro: JSON.stringify(detalhe).slice(0, 500) });
    }
  }

  console.log('[Onboarding]', { candidatos: fila.length, enviados, pulados, falhas });
  return { enviados, falhas, pulados, candidatos: fila.length };
}

/** O que sairia agora, sem mandar nada — para conferir antes de ligar a régua. */
export async function simularOnboarding(): Promise<{
  enviaria: Array<{ etapa: EtapaOnboarding; produto: string; horas: number; pularPor: string | null }>;
  config: Pick<Config, 'ativo' | 'template_dia3' | 'horas_dia3' | 'iniciado_em'>;
}> {
  const cfg = await lerConfig();
  const janelaDias = Math.ceil((cfg.horas_dia3 + cfg.tolerancia_horas) / 24) + 1;
  const [vendas, encerradas] = await Promise.all([lerVendas(janelaDias), transacoesEncerradas(janelaDias)]);
  const fila = candidatos(vendas, cfg);
  const falando = await contatosFalando(
    [...new Set(fila.map((c) => c.venda.contact_id!).filter(Boolean))],
    janelaDias
  );
  const { data: jaFeitos } = await supabaseAdmin
    .from('boas_vindas_envios')
    .select('transaction_id, tipo')
    .eq('tipo', 'dia3');
  const feito = new Set((jaFeitos ?? []).map((e) => `${e.transaction_id}:${e.tipo}`));

  const enviaria = await Promise.all(fila.map(async ({ etapa, venda }) => {
    const horas = Math.round((Date.now() - new Date(venda.sold_at).getTime()) / 3_600_000);
    let pularPor: string | null = null;
    if (feito.has(`${venda.transaction_id}:${etapa}`)) pularPor = 'ja_enviado';
    else if (!cfg.template_dia3) pularPor = 'sem_template';
    else if (encerradas.has(venda.transaction_id!)) pularPor = 'reembolsado_ou_cancelado';
    else if (produtoIgnorado(venda.product_names, cfg.produtos_ignorados)) pularPor = 'produto_ignorado';
    else if (falando.has(venda.contact_id!)) pularPor = 'conversa_em_andamento';
    else if (!venda.contact_email) pularPor = 'sem_email';
    else if ((await naoComecouAEstudar(venda.contact_email)) !== true) pularPor = 'ja_comecou';
    return { etapa, produto: produtoCurto(venda.product_names), horas, pularPor };
  }));

  return {
    enviaria,
    config: {
      ativo: cfg.ativo,
      template_dia3: cfg.template_dia3,
      horas_dia3: cfg.horas_dia3,
      iniciado_em: cfg.iniciado_em,
    },
  };
}
