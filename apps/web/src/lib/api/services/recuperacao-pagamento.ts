/**
 * Régua de recuperação de boleto e PIX não pagos.
 *
 * Quem gera uma cobrança já escolheu o produto, já decidiu o preço e já digitou
 * o CPF — e mesmo assim quase metade não conclui. Em 30 dias isso somou
 * R$ 130 mil na Guru. Não é um problema de anúncio, é de lembrete.
 *
 * COMO A MENSAGEM SAI: por template aprovado, não por texto livre. Dos 144
 * pendentes de 14 dias, nenhum tinha falado no WhatsApp nas últimas 24h, e fora
 * dessa janela a Meta recusa texto livre com (#131047). O template é da
 * categoria UTILITY — "lembrete de pagamento" é exatamente o caso de uso dela.
 * Quando a pessoa responde, a janela abre e o atendimento segue normal.
 *
 * O QUE É "PENDENTE": a última linha daquela transação em `guru_sales` está em
 * `abandoned`, `billet_printed` ou `waiting_payment`, e nenhuma linha dela está
 * em `approved` ou `refunded`. A tabela é um log — a mesma transação aparece
 * várias vezes conforme muda de status —, então olhar só uma linha erraria.
 *
 * O QUE IMPEDE MANDAR DUAS VEZES: a unique (transaction_id, etapa) em
 * `recuperacao_envios`, reservada ANTES do envio. Dois crons simultâneos, um
 * retry, um deploy no meio — o segundo bate na constraint e desiste.
 */
import { supabaseAdmin } from '../supabase';
import { lerTudo } from '../paginado';
import { sendWhatsAppTemplate, textoDoTemplate } from './whatsapp';
import { createMessage } from './message';
import { findOrCreateConversation, updateConversation } from './conversation';
import { partesEmBrasilia } from '@/lib/timezone';

const STATUS_PENDENTE = ['abandoned', 'billet_printed', 'waiting_payment'];
const STATUS_RESOLVIDO = ['approved', 'refunded'];

export interface ResultadoRecuperacao {
  enviados: number;
  falhas: number;
  /** Filtrados por já ter comprado, parcela sem template ou template ausente. */
  pulados: number;
  candidatos: number;
  motivo?: string;
}

interface Config {
  ativo: boolean;
  template_nome: string | null;
  /** Template do 2º lembrete. Nulo = repete o da etapa 1. */
  template_nome_etapa2: string | null;
  /** Template do checkout abandonado (sem link). Nulo = não aborda abandonados. */
  template_abandonado: string | null;
  /** Template da parcela de assinatura em atraso. Nulo = não aborda. */
  template_parcela: string | null;
  link_base: string;
  template_idioma: string;
  etapa1_horas: number;
  etapa2_horas: number;
  hora_inicio: number;
  hora_fim: number;
  max_por_execucao: number;
  janela_dias: number;
  /** Janela do histórico de compras, bem maior que a da fila. */
  historico_dias: number;
  produtos_ignorados: string[];
}

interface LinhaVenda {
  transaction_id: string | null;
  status: string | null;
  sold_at: string;
  created_at: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  product_names: string | null;
  payment_method: string | null;
  payment_total: number | null;
}

/** "Maria Aparecida da Silva" -> "Maria". O template trata a pessoa pelo nome. */
function primeiroNome(nome: string | null): string {
  const limpo = (nome || '').trim().split(/\s+/)[0] || '';
  if (!limpo) return 'tudo bem';
  return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
}

function valorBR(v: number | null): string {
  return (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Só o primeiro produto: o template tem uma linha, não uma lista. */
function produtoCurto(nomes: string | null): string {
  const primeiro = (nomes || '').split(/\s*[,;|]\s*/)[0].trim();
  return primeiro.length > 60 ? primeiro.slice(0, 57) + '...' : primeiro || 'seu curso';
}

/**
 * Agrupa o log por transação e devolve as que continuam pendentes, da mais
 * antiga para a mais nova.
 */
export function pendentesDoLog(linhas: LinhaVenda[]): LinhaVenda[] {
  const porTransacao = new Map<string, { ultima: LinhaVenda; resolvida: boolean }>();

  for (const linha of linhas) {
    const id = linha.transaction_id;
    if (!id) continue;
    const atual = porTransacao.get(id);
    const resolvida = (atual?.resolvida ?? false) || STATUS_RESOLVIDO.includes(linha.status || '');
    // As linhas chegam em ordem cronológica de gravação: a última vence.
    porTransacao.set(id, { ultima: linha, resolvida });
  }

  return [...porTransacao.values()]
    .filter((t) => !t.resolvida && STATUS_PENDENTE.includes(t.ultima.status || ''))
    .map((t) => t.ultima)
    .sort((a, b) => new Date(a.sold_at).getTime() - new Date(b.sold_at).getTime());
}

/**
 * Chave de "esta pessoa já comprou isto": contato + nome do produto.
 *
 * Não dá para usar só o contato — quem comprou o PM BA e abandonou o PC BA
 * precisa receber o lembrete do PC BA.
 */
function chaveCompra(contactId: string | null, produto: string | null): string {
  return `${contactId ?? ''}::${(produto ?? '').trim().toLowerCase()}`;
}

/** Conjunto de (contato, produto) com pelo menos um pagamento aprovado. */
export function compradoresPorProduto(linhas: LinhaVenda[]): Set<string> {
  const comprou = new Set<string>();
  for (const linha of linhas) {
    if (linha.status === 'approved' && linha.contact_id) {
      comprou.add(chaveCompra(linha.contact_id, linha.product_names));
    }
  }
  return comprou;
}

/**
 * Pergunta à Guru se esta cobrança é uma parcela de assinatura.
 *
 * `invoice.type === 'cycle'` é o único sinal que separa "parcela 3 de 12 de um
 * aluno antigo" de "compra única que não foi paga" — `guru_sales` guarda os
 * dois do mesmo jeito. Sem token ou com a API fora do ar devolve `null`, e quem
 * chama trata como desconhecido: melhor não mandar do que mandar o texto errado.
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
    console.error('[Recuperação] falha ao consultar a Guru:', err);
    return null;
  }
}

/**
 * Quem já comprou o quê, numa janela BEM maior que a da fila.
 *
 * Usar a mesma janela de 7 dias da fila era um bug com consequência grave: quem
 * paga a parcela 3 de 12 teve as anteriores aprovadas há 30 ou 60 dias, fora da
 * janela — então a parcela atrasada dele era lida como matrícula nova e ele
 * receberia "sua matrícula ficou pendente" depois de meses estudando.
 */
async function historicoDeCompras(dias: number): Promise<Set<string>> {
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();
  // Paginado, e não `.limit()`: o PostgREST corta toda resposta em 1.000 linhas,
  // e este filtro só protege alguém se enxergar TODAS as compras aprovadas. Com
  // `.limit(20000)` ele via 1.000 de 6.673 e não batia em ninguém. Ver `lerTudo`.
  const linhas = await lerTudo<LinhaVenda>((de, ate) =>
    supabaseAdmin
      .from('guru_sales')
      .select('contact_id, product_names, status')
      .eq('status', 'approved')
      .gte('sold_at', desde)
      .order('sold_at', { ascending: true })
      .range(de, ate)
  );
  return compradoresPorProduto(linhas);
}

/** 1 = primeiro lembrete, 2 = segundo, 0 = ainda cedo (ou tarde demais). */
export function etapaDe(horas: number, cfg: Pick<Config, 'etapa1_horas' | 'etapa2_horas' | 'janela_dias'>): 0 | 1 | 2 {
  if (horas > cfg.janela_dias * 24) return 0;
  if (horas >= cfg.etapa2_horas) return 2;
  if (horas >= cfg.etapa1_horas) return 1;
  return 0;
}

export async function enviarRecuperacoesPendentes(): Promise<ResultadoRecuperacao> {
  const vazio = { enviados: 0, falhas: 0, pulados: 0, candidatos: 0 };

  const { data: cfgRow } = await supabaseAdmin
    .from('recuperacao_config')
    .select('*')
    .limit(1)
    .maybeSingle();
  const cfg = cfgRow as Config | null;

  if (!cfg?.ativo) return { ...vazio, motivo: 'régua desligada' };
  if (!cfg.template_nome) return { ...vazio, motivo: 'template não configurado' };

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

  const desde = new Date(Date.now() - cfg.janela_dias * 86400_000).toISOString();
  let linhas: LinhaVenda[];
  try {
    // Paginado: a fila precisa da janela inteira. Uma leitura truncada não erra
    // mandando demais — erra calando, e calar não aparece em lugar nenhum.
    linhas = await lerTudo<LinhaVenda>((de, ate) =>
      supabaseAdmin
        .from('guru_sales')
        .select(
          'transaction_id, status, sold_at, created_at, contact_id, contact_name, contact_phone, product_names, payment_method, payment_total'
        )
        .gte('sold_at', desde)
        .order('created_at', { ascending: true })
        .range(de, ate)
    );
  } catch (erro) {
    console.error('[Recuperação] falha ao ler guru_sales:', erro);
    return { ...vazio, motivo: 'falha ao ler as vendas' };
  }

  const ignorados = (cfg.produtos_ignorados || []).map((p) => p.toLowerCase());
  const pendentes = pendentesDoLog(linhas).filter((p) => {
    if (!p.contact_id || !p.contact_phone) return false;
    const nome = (p.product_names || '').toLowerCase();
    return !ignorados.some((i) => i && nome.includes(i));
  });

  const jaComprou = await historicoDeCompras(cfg.historico_dias);

  // Uma pessoa pode ter duas cobranças pendentes ao mesmo tempo — duas parcelas
  // atrasadas, por exemplo. Duas mensagens iguais no mesmo dia lê como robô
  // travado, então quem já foi abordado nas últimas 24h fica de fora.
  const ontem = new Date(Date.now() - 86400_000).toISOString();
  const { data: recentes } = await supabaseAdmin
    .from('recuperacao_envios')
    .select('contact_id')
    .eq('status', 'sent')
    .gte('created_at', ontem);
  const abordadoHoje = new Set((recentes ?? []).map((r) => r.contact_id).filter(Boolean));

  let enviados = 0;
  let falhas = 0;
  let pulados = 0;

  for (const venda of pendentes) {
    if (enviados >= cfg.max_por_execucao) break;

    const horas = (Date.now() - new Date(venda.sold_at).getTime()) / 3600_000;
    const etapa = etapaDe(horas, cfg);
    if (etapa === 0) continue;
    if (venda.contact_id && abordadoHoje.has(venda.contact_id)) continue;

    // Reserva primeiro: é a unique que serializa, não este if.
    const { error: reservaErro } = await supabaseAdmin.from('recuperacao_envios').insert({
      transaction_id: venda.transaction_id,
      etapa,
      contact_id: venda.contact_id,
      produto: venda.product_names,
      valor: venda.payment_total,
      metodo: venda.payment_method,
      status: 'sent',
    });
    if (reservaErro) {
      // 23505 = esta transação já recebeu esta etapa. É o caso comum.
      if (reservaErro.code !== '23505') {
        console.error('[Recuperação] falha ao reservar:', reservaErro);
      }
      continue;
    }

    const marcarPulado = async (motivo: string) => {
      await supabaseAdmin
        .from('recuperacao_envios')
        .update({ status: 'skipped', motivo })
        .eq('transaction_id', venda.transaction_id)
        .eq('etapa', etapa);
      pulados++;
    };

    // Abandonado não tem o que pagar: a página da fatura abre com o carimbo
    // "Abandonada" e nenhum botão. Vai por um template sem link — ou não vai.
    const abandonado = venda.status === 'abandoned';

    // A Guru é perguntada SEMPRE, e primeiro: `invoice.type` é a única fonte que
    // sabe se isto é parcela de assinatura. Depender do histórico para decidir
    // isso é frágil — foi o que fez parcelas serem lidas como matrícula nova.
    const parcela = await ehParcelaDeAssinatura(venda.transaction_id);

    let template: string | null;
    // `true` só para o template que NÃO tem botão de link (o de abandonado). É o
    // template que manda, não o status da venda: uma parcela de assinatura pode
    // estar `abandoned` e mesmo assim vai pelo texto de parcela, que TEM botão —
    // mandar sem o parâmetro dá #131008 e a mensagem não sai. Aconteceu com 3
    // cobranças no primeiro disparo, em 22/09/2026.
    let semBotao = false;
    if (parcela === true) {
      if (!cfg.template_parcela) {
        await marcarPulado('parcela_sem_template');
        continue;
      }
      if (abandonado) {
        // Parcela abandonada: a fatura abre com o carimbo "Abandonada" e nenhuma
        // forma de pagar (conferido na página em 22/09/2026). Não existe link
        // honesto para mandar, então esta fica de fora até haver um.
        await marcarPulado('parcela_abandonada');
        continue;
      }
      template = cfg.template_parcela;
    } else if (jaComprou.has(chaveCompra(venda.contact_id, venda.product_names))) {
      // Não é parcela e a pessoa já tem este produto pago: pedido duplicado.
      // Se a consulta à Guru falhou (null), também cai aqui — e calar é certo.
      await marcarPulado('ja_comprou');
      continue;
    } else {
      // O segundo lembrete tem texto próprio: repetir a mesma mensagem três
      // dias depois lê como robô quebrado. Sem ele, cai no da etapa 1.
      if (abandonado) {
        template = cfg.template_abandonado;
        semBotao = true;
      } else {
        template = (etapa === 2 && cfg.template_nome_etapa2) || cfg.template_nome;
      }
    }

    if (!template) {
      await marcarPulado('sem_template');
      continue;
    }

    const parametros = [
      primeiroNome(venda.contact_name),
      produtoCurto(venda.product_names),
      valorBR(venda.payment_total),
    ];

    try {
      const envio = await sendWhatsAppTemplate({
        phoneNumberId: canal.external_id,
        accessToken: canal.access_token,
        to: venda.contact_phone!,
        template,
        idioma: cfg.template_idioma,
        parametros,
        // A fatura mora em <link_base><transaction_id>; o template guarda a base.
        botaoUrlSufixo: semBotao ? undefined : venda.transaction_id || undefined,
      });

      const conversa = await findOrCreateConversation({
        channelId: canal.id,
        contactId: venda.contact_id!,
      });
      const externalId = envio.messages?.[0]?.id;
      const rotulo = abandonado
        ? `🤖 Matrícula não concluída (${etapa}ª mensagem)`
        : `🤖 Lembrete de pagamento (${etapa}ª mensagem)`;

      // O que fica na conversa é o texto que a pessoa leu, não um rótulo: quem
      // abre o inbox para atender precisa ver a mensagem, senão responde no
      // escuro. O rótulo só entra se a Meta não devolver o corpo do template.
      const texto = await textoDoTemplate({
        wabaId: canal.business_account_id,
        accessToken: canal.access_token,
        nome: template,
        idioma: cfg.template_idioma,
        parametros,
        botaoUrlSufixo: semBotao ? undefined : venda.transaction_id || undefined,
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
          via: 'recuperacao_pagamento',
          etapa,
          transaction_id: venda.transaction_id,
          template,
          produto: venda.product_names,
          valor: venda.payment_total,
          metodo: venda.payment_method,
          // O atendente precisa ver o mesmo link que a pessoa recebeu.
          link: abandonado ? null : `${cfg.link_base}${venda.transaction_id}`,
        },
      });

      await updateConversation(conversa.id, {
        lastMessageAt: new Date().toISOString(),
        lastMessagePreview: preview,
      });

      await supabaseAdmin
        .from('recuperacao_envios')
        .update({ conversation_id: conversa.id, external_id: externalId })
        .eq('transaction_id', venda.transaction_id)
        .eq('etapa', etapa);

      if (venda.contact_id) abordadoHoje.add(venda.contact_id);
      enviados++;
    } catch (err) {
      falhas++;
      const detalhe =
        (err as { response?: { data?: unknown } })?.response?.data ??
        (err instanceof Error ? err.message : 'erro');
      console.error('[Recuperação] falha ao enviar:', detalhe);
      // Fica registrado como falha, e não volta na próxima rodada: um número que
      // a Meta recusa vai recusar de novo, e insistir queima o número.
      await supabaseAdmin
        .from('recuperacao_envios')
        .update({ status: 'failed', erro: JSON.stringify(detalhe).slice(0, 500) })
        .eq('transaction_id', venda.transaction_id)
        .eq('etapa', etapa);
    }
  }

  console.log('[Recuperação]', { candidatos: pendentes.length, enviados, pulados, falhas });
  return { enviados, falhas, pulados, candidatos: pendentes.length };
}

/**
 * O que a régua MANDARIA agora, sem mandar nada. É o que a tela de ajustes usa
 * para mostrar a fila antes de alguém ligar o interruptor.
 */
export async function simularRecuperacoes(): Promise<{
  candidatos: Array<{
    produto: string;
    valor: number | null;
    metodo: string | null;
    horas: number;
    etapa: number;
    jaComprou: boolean;
  }>;
  total: number;
  /** Já são alunos deste produto: pedido duplicado ou parcela em atraso. */
  jaCompraram: number;
  jaCompraramTotal: number;
}> {
  const { data: cfgRow } = await supabaseAdmin
    .from('recuperacao_config')
    .select('*')
    .limit(1)
    .maybeSingle();
  const cfg = (cfgRow ?? {
    etapa1_horas: 20,
    etapa2_horas: 68,
    janela_dias: 7,
    produtos_ignorados: [],
  }) as Config;

  const desde = new Date(Date.now() - cfg.janela_dias * 86400_000).toISOString();
  const linhas = await lerTudo<LinhaVenda>((de, ate) =>
    supabaseAdmin
      .from('guru_sales')
      .select(
        'transaction_id, status, sold_at, created_at, contact_id, contact_name, contact_phone, product_names, payment_method, payment_total'
      )
      .gte('sold_at', desde)
      .order('created_at', { ascending: true })
      .range(de, ate)
  );

  const { data: jaEnviados } = await supabaseAdmin
    .from('recuperacao_envios')
    .select('transaction_id, etapa');
  const enviado = new Set((jaEnviados ?? []).map((e) => `${e.transaction_id}:${e.etapa}`));

  // A simulação aplica os MESMOS filtros do envio — inclusive a janela longa do
  // histórico. Uma prévia calculada de outro jeito não serve para decidir.
  const jaComprou = await historicoDeCompras(cfg.historico_dias ?? 365);

  const candidatos = pendentesDoLog(linhas)
    .filter((p) => p.contact_id && p.contact_phone)
    .map((p) => {
      const horas = (Date.now() - new Date(p.sold_at).getTime()) / 3600_000;
      return {
        produto: produtoCurto(p.product_names),
        valor: p.payment_total,
        metodo: p.payment_method,
        horas: Math.round(horas),
        etapa: etapaDe(horas, cfg),
        jaComprou: jaComprou.has(chaveCompra(p.contact_id, p.product_names)),
        chave: `${p.transaction_id}:${etapaDe(horas, cfg)}`,
      };
    })
    .filter((c) => c.etapa > 0 && !enviado.has(c.chave))
    .map(({ chave: _chave, ...resto }) => resto);

  // Quem já comprou só recebe se for parcela de assinatura E houver template
  // para isso — na simulação entra separado, para ficar visível quanto da fila
  // é aluno antigo.
  const alunosAntigos = candidatos.filter((c) => c.jaComprou);
  const novos = candidatos.filter((c) => !c.jaComprou);

  return {
    candidatos: novos,
    total: novos.reduce((soma, c) => soma + (c.valor ?? 0), 0),
    jaCompraram: alunosAntigos.length,
    jaCompraramTotal: alunosAntigos.reduce((soma, c) => soma + (c.valor ?? 0), 0),
  };
}
