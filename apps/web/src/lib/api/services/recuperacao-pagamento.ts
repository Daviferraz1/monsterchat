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
import { sendWhatsAppTemplate } from './whatsapp';
import { createMessage } from './message';
import { findOrCreateConversation, updateConversation } from './conversation';
import { partesEmBrasilia } from '@/lib/timezone';

const STATUS_PENDENTE = ['abandoned', 'billet_printed', 'waiting_payment'];
const STATUS_RESOLVIDO = ['approved', 'refunded'];

export interface ResultadoRecuperacao {
  enviados: number;
  falhas: number;
  candidatos: number;
  motivo?: string;
}

interface Config {
  ativo: boolean;
  template_nome: string | null;
  /** Template do 2º lembrete. Nulo = repete o da etapa 1. */
  template_nome_etapa2: string | null;
  template_idioma: string;
  etapa1_horas: number;
  etapa2_horas: number;
  hora_inicio: number;
  hora_fim: number;
  max_por_execucao: number;
  janela_dias: number;
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

/** 1 = primeiro lembrete, 2 = segundo, 0 = ainda cedo (ou tarde demais). */
export function etapaDe(horas: number, cfg: Pick<Config, 'etapa1_horas' | 'etapa2_horas' | 'janela_dias'>): 0 | 1 | 2 {
  if (horas > cfg.janela_dias * 24) return 0;
  if (horas >= cfg.etapa2_horas) return 2;
  if (horas >= cfg.etapa1_horas) return 1;
  return 0;
}

export async function enviarRecuperacoesPendentes(): Promise<ResultadoRecuperacao> {
  const vazio = { enviados: 0, falhas: 0, candidatos: 0 };

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
    .select('id, external_id, access_token')
    .eq('type', 'whatsapp')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (!canal?.access_token || !canal.external_id) {
    return { ...vazio, motivo: 'canal de WhatsApp sem token' };
  }

  const desde = new Date(Date.now() - cfg.janela_dias * 86400_000).toISOString();
  const { data: linhas, error } = await supabaseAdmin
    .from('guru_sales')
    .select(
      'transaction_id, status, sold_at, created_at, contact_id, contact_name, contact_phone, product_names, payment_method, payment_total'
    )
    .gte('sold_at', desde)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) {
    console.error('[Recuperação] falha ao ler guru_sales:', error);
    return { ...vazio, motivo: 'falha ao ler as vendas' };
  }

  const ignorados = (cfg.produtos_ignorados || []).map((p) => p.toLowerCase());
  const pendentes = pendentesDoLog((linhas ?? []) as LinhaVenda[]).filter((p) => {
    if (!p.contact_id || !p.contact_phone) return false;
    const nome = (p.product_names || '').toLowerCase();
    return !ignorados.some((i) => i && nome.includes(i));
  });

  let enviados = 0;
  let falhas = 0;

  for (const venda of pendentes) {
    if (enviados >= cfg.max_por_execucao) break;

    const horas = (Date.now() - new Date(venda.sold_at).getTime()) / 3600_000;
    const etapa = etapaDe(horas, cfg);
    if (etapa === 0) continue;

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

    // O segundo lembrete tem texto próprio: repetir a mesma mensagem três dias
    // depois lê como robô quebrado. Sem template próprio, cai no da etapa 1.
    const template = (etapa === 2 && cfg.template_nome_etapa2) || cfg.template_nome;

    try {
      const envio = await sendWhatsAppTemplate({
        phoneNumberId: canal.external_id,
        accessToken: canal.access_token,
        to: venda.contact_phone!,
        template,
        idioma: cfg.template_idioma,
        parametros: [
          primeiroNome(venda.contact_name),
          produtoCurto(venda.product_names),
          valorBR(venda.payment_total),
        ],
      });

      const conversa = await findOrCreateConversation({
        channelId: canal.id,
        contactId: venda.contact_id!,
      });
      const externalId = envio.messages?.[0]?.id;
      const preview = `🤖 Lembrete de pagamento (${etapa}ª mensagem)`;

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

  console.log('[Recuperação]', { candidatos: pendentes.length, enviados, falhas });
  return { enviados, falhas, candidatos: pendentes.length };
}

/**
 * O que a régua MANDARIA agora, sem mandar nada. É o que a tela de ajustes usa
 * para mostrar a fila antes de alguém ligar o interruptor.
 */
export async function simularRecuperacoes(): Promise<{
  candidatos: Array<{ produto: string; valor: number | null; metodo: string | null; horas: number; etapa: number }>;
  total: number;
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
  const { data: linhas } = await supabaseAdmin
    .from('guru_sales')
    .select(
      'transaction_id, status, sold_at, created_at, contact_id, contact_name, contact_phone, product_names, payment_method, payment_total'
    )
    .gte('sold_at', desde)
    .order('created_at', { ascending: true })
    .limit(5000);

  const { data: jaEnviados } = await supabaseAdmin
    .from('recuperacao_envios')
    .select('transaction_id, etapa');
  const enviado = new Set((jaEnviados ?? []).map((e) => `${e.transaction_id}:${e.etapa}`));

  const candidatos = pendentesDoLog((linhas ?? []) as LinhaVenda[])
    .filter((p) => p.contact_id && p.contact_phone)
    .map((p) => {
      const horas = (Date.now() - new Date(p.sold_at).getTime()) / 3600_000;
      return {
        produto: produtoCurto(p.product_names),
        valor: p.payment_total,
        metodo: p.payment_method,
        horas: Math.round(horas),
        etapa: etapaDe(horas, cfg),
        chave: `${p.transaction_id}:${etapaDe(horas, cfg)}`,
      };
    })
    .filter((c) => c.etapa > 0 && !enviado.has(c.chave))
    .map(({ chave: _chave, ...resto }) => resto);

  return { candidatos, total: candidatos.reduce((s, c) => s + (c.valor ?? 0), 0) };
}
