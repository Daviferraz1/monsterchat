/**
 * Núcleo agêntico da IA (Fase 2). Em modo copiloto, gera a mensagem sugerida
 * para o atendente usando Claude (Sonnet) num loop de tool use: o modelo decide
 * quais ferramentas chamar (catálogo, base de conhecimento, pagamento, acesso)
 * para fundamentar a resposta em dados reais, em vez de "empurrar" tudo no prompt.
 */
import Anthropic from '@anthropic-ai/sdk';
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';
import { getMatchingProducts, listProducts } from './catalog';
import type { ProductRow } from './catalog';
import { getCredentialsByEmail } from '../contacts-credentials';
import { searchKnowledge } from './knowledge-search';
import { fetchGuruTransactionsLive } from '../integrations/guru-live';
import { diagnosticarAcesso } from '../integrations/platform-access';

const MODEL = 'claude-sonnet-4-6';
const MAX_ITERATIONS = 6;
const MAX_TOKENS = 800;

export interface AgentContext {
  /** Conversa (ALUNO/ATENDENTE em ordem) ou, na falta, mensagens recentes do aluno. */
  conversationText: string;
  contactName?: string;
  brand?: string;
  contactId?: string;
  contactPhone?: string;
  conversationId?: string;
  /** Imagens recentes enviadas pelo aluno (print de questão, comprovante, tela). */
  images?: Array<{ url: string; mime?: string | null }>;
  /** Saudação conforme o horário atual (ex.: 'boa tarde'). */
  nowHint?: string;
  /** Memória da conversa (resumo + ficha) para conversas longas. */
  memoryBlock?: string;
  /** Dados pessoais já registrados no cadastro do contato (nome completo, CPF, etc.). */
  contactDataBlock?: string;
}

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Baixa as imagens e converte em blocos base64 para o Claude analisar (best-effort). */
async function fetchImageBlocks(
  images?: Array<{ url: string; mime?: string | null }>
): Promise<Anthropic.ImageBlockParam[]> {
  if (!images?.length) return [];
  const blocks: Anthropic.ImageBlockParam[] = [];
  for (const img of images.slice(0, 2)) {
    if (!img?.url) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(img.url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const ct = (img.mime || res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const mediaType = (ALLOWED_IMAGE_TYPES.has(ct) ? ct : 'image/jpeg') as
        | 'image/jpeg'
        | 'image/png'
        | 'image/gif'
        | 'image/webp';
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 4_500_000) continue; // limite ~5MB do Anthropic
      blocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } });
    } catch (err) {
      console.error('[IA agent] falha ao baixar imagem', err);
    }
  }
  return blocks;
}

const PAYMENT_METHODS_INFO =
  'Pix, boleto ou cartão. No cartão dá para parcelar; Pix e boleto são à vista (não há boleto parcelado). Em planos com recorrência mensal, aceita boleto, Pix ou cartão todo mês.';

const tools: Anthropic.Tool[] = [
  {
    name: 'buscar_conhecimento',
    description:
      'Busca respostas-ouro de atendimentos anteriores por similaridade (base de conhecimento). Use para dúvidas de suporte, FAQ e procedimentos. Retorna perguntas-tipo e respostas-ouro parecidas.',
    input_schema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'A dúvida do aluno em poucas palavras' },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'buscar_produto',
    description:
      'Retorna os cursos que batem com a busca E o catálogo completo (todos os cursos ativos, com links). Use quando o lead pergunta sobre um curso, preço ou intenção de compra. SEMPRE confira o catálogo completo antes de dizer que um curso não existe — o nome pode diferir do que o aluno digitou (ex.: "PMBA" = "PM Bahia").',
    input_schema: {
      type: 'object',
      properties: {
        intencao: {
          type: 'string',
          description: 'Curso/concurso/cargo de interesse (ex.: "bombeiro militar minas", "guarda municipal")',
        },
      },
      required: ['intencao'],
    },
  },
  {
    name: 'consultar_pagamento',
    description:
      'Situação de pagamento do contato NO SISTEMA: compras avulsas + assinaturas/mensalidades (status da fatura, se está EM ATRASO e link para pagar). Use quando o aluno fala de pagamento/boleto/mensalidade ou diz que já comprou.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'E-mail da compra, se o aluno informar. Opcional — sem ele, busca pelo contato atual.',
        },
      },
      required: [],
    },
  },
  {
    name: 'consultar_guru_online',
    description:
      'Confere o pagamento DIRETO na API do Guru, em tempo real (mais confiável que o sistema local). Use quando precisar confirmar e o local não bastar, ou o aluno contestar ("paguei e não consta"). Pode levar alguns segundos.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'E-mail da compra, se o aluno informar (ajuda a localizar).' },
      },
      required: [],
    },
  },
  {
    name: 'verificar_acesso_plataforma',
    description:
      'Diagnostica o ACESSO do aluno na plataforma (Monster Questões + Study): se tem cadastro, se Questões/curso estão liberados e válidos, e o último webhook do Guru. Use quando o aluno diz que comprou e não recebeu acesso, ou não consegue acessar. Informe o e-mail (ou CPF) da compra.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'E-mail da compra' },
        cpf: { type: 'string', description: 'CPF (opcional)' },
      },
      required: [],
    },
  },
  {
    name: 'buscar_credenciais',
    description:
      'Busca os dados de acesso (login/senha por plataforma) pelo e-mail da compra. Use SOMENTE quando o aluno pede acesso/login/senha e informou o e-mail.',
    input_schema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'E-mail usado na compra' },
      },
      required: ['email'],
    },
  },
  {
    name: 'salvar_dados_contato',
    description:
      'Registra no cadastro do contato os DADOS PESSOAIS que o aluno informar (para suporte e uso futuro). Chame sempre que ele fornecer nome completo, CPF, telefone, endereço ou e-mail. Registre só o que ele realmente informou — não invente nem fique pedindo dados sem motivo.',
    input_schema: {
      type: 'object',
      properties: {
        nome_completo: { type: 'string' },
        cpf: { type: 'string' },
        telefone: { type: 'string' },
        endereco: { type: 'string' },
        email: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'classificar_lead',
    description:
      'Registra o lead para follow-up quando NÃO há solução imediata e será preciso contatá-lo depois — ex.: o curso/concurso que ele quer ainda não existe no catálogo e ele quer ser avisado no lançamento, ou pediu retorno futuro. Chame ANTES de redigir a mensagem nesses casos. NÃO use para dúvidas já resolvidas ou quando o curso existe.',
    input_schema: {
      type: 'object',
      properties: {
        interesse: { type: 'string', description: 'O que o lead quer (ex.: "Curso PRF", "PM SP", "tecnólogo")' },
        motivo: {
          type: 'string',
          enum: ['curso_indisponivel', 'aguardando_edital', 'follow_up', 'outro'],
          description: 'Por que precisa de follow-up',
        },
        observacao: { type: 'string', description: 'Detalhe opcional (prazo, contexto)' },
      },
      required: ['interesse'],
    },
  },
];

/** Classifica o lead para follow-up. Idempotente (não duplica ao regerar a sugestão). */
async function registrarLead(
  ctx: AgentContext,
  interesse: string,
  motivo: string,
  obs: string
): Promise<void> {
  const convId = ctx.conversationId;
  if (!convId) return;

  // 1) Análise da conversa (upsert — uma linha por conversa)
  await supabaseAdmin.from('conversation_analysis').upsert(
    {
      conversation_id: convId,
      category: 'lead',
      intent: `Lead interessado: ${interesse}${obs ? ` — ${obs}` : ''}`,
      resolution_status: 'unresolved',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id' }
  );

  // 2) Nota interna (uma por conversa — evita spam ao regerar a sugestão)
  const { data: existing } = await supabaseAdmin
    .from('internal_notes')
    .select('id')
    .eq('conversation_id', convId)
    .ilike('body', '%LEAD para follow-up%')
    .limit(1);
  if (!existing?.length) {
    const body = `🏷️ LEAD para follow-up\nInteresse: ${interesse}\nMotivo: ${motivo}${obs ? `\nObs.: ${obs}` : ''}`;
    await supabaseAdmin.from('internal_notes').insert({ conversation_id: convId, author_id: null, body });
  }

  // 3) Tag no contato (consultável depois: "todos os leads de PRF")
  if (ctx.contactId) {
    const { data: c } = await supabaseAdmin
      .from('contacts')
      .select('metadata')
      .eq('id', ctx.contactId)
      .maybeSingle();
    const metadata = ((c?.metadata as Record<string, unknown>) || {});
    metadata.lead = { interesse, motivo, obs: obs || null, at: new Date().toISOString() };
    await supabaseAdmin
      .from('contacts')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', ctx.contactId);
  }
}

function formatProductForTool(p: ProductRow): string {
  const sales = p.sales_page_url?.trim();
  const lines = [
    `${p.name} (${p.brand.toUpperCase()})${p.status !== 'available' ? ` [${p.status}]` : ''}`,
    p.target_exam ? `Concurso: ${p.target_exam}${p.target_role ? ' — ' + p.target_role : ''}` : '',
    `Preço: ${p.price_display}${p.price_recurring_display ? ` | mensal: ${p.price_recurring_display}` : ''}`,
    sales
      ? `Página de vendas (envie quando o lead está interessado/avaliando o curso): ${sales}`
      : 'Página de vendas: (não há — neste caso use o checkout para apresentar o curso)',
    `Checkout/pagamento (envie só quando o lead já decidiu comprar): ${p.checkout_url}${p.checkout_url_subscription ? ` | mensal: ${p.checkout_url_subscription}` : ''}`,
    p.includes ? `Inclui: ${p.includes}` : '',
    p.duration ? `Duração: ${p.duration}` : '',
    p.extra_info_for_ia ? `Obs.: ${p.extra_info_for_ia}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Linha compacta para listar o catálogo inteiro (com links) sem inflar demais. */
function formatProductCompact(p: ProductRow): string {
  const concurso = [p.target_exam, p.target_role].filter(Boolean).join(' — ');
  const sales = p.sales_page_url?.trim();
  return `• ${p.name} (${p.brand.toUpperCase()})${p.status !== 'available' ? ` [${p.status}]` : ''}${concurso ? ` | ${concurso}` : ''} | ${p.price_display} | vendas: ${sales || '-'} | checkout: ${p.checkout_url}`;
}

type SaleRow = {
  product_names: string;
  status: string | null;
  sold_at: string;
  payment_method: string | null;
  payment_total: number | null;
};

async function lookupSales(ctx: AgentContext, email?: string): Promise<SaleRow[]> {
  const select = 'product_names, status, sold_at, payment_method, payment_total';
  if (ctx.contactId) {
    const { data } = await supabaseAdmin
      .from('guru_sales')
      .select(select)
      .eq('contact_id', ctx.contactId)
      .order('sold_at', { ascending: false })
      .limit(3);
    if (data?.length) return data as SaleRow[];
  }
  if (email) {
    const { data } = await supabaseAdmin
      .from('guru_sales')
      .select(select)
      .ilike('contact_email', email)
      .order('sold_at', { ascending: false })
      .limit(3);
    if (data?.length) return data as SaleRow[];
  }
  if (ctx.contactPhone) {
    const digits = ctx.contactPhone.replace(/\D/g, '').slice(-8);
    if (digits) {
      const { data } = await supabaseAdmin
        .from('guru_sales')
        .select(select)
        .ilike('contact_phone', `%${digits}%`)
        .order('sold_at', { ascending: false })
        .limit(3);
      if (data?.length) return data as SaleRow[];
    }
  }
  return [];
}

/** Assinaturas/mensalidades do contato (guru_subscriptions): status da fatura, atraso, link de pagamento. */
async function lookupSubscriptions(ctx: AgentContext, email?: string): Promise<string[]> {
  const select =
    'product_name, last_status, current_invoice_status, current_invoice_value, current_invoice_charge_at, current_invoice_payment_url, is_overdue, days_overdue';
  const fmt = (rows: Array<Record<string, any>>): string[] =>
    rows.map((s) => {
      const p: string[] = [`Assinatura: ${s.product_name || '-'}`, `status: ${s.last_status || '-'}`];
      if (s.current_invoice_status) p.push(`fatura: ${s.current_invoice_status}`);
      if (s.is_overdue) p.push(`EM ATRASO${s.days_overdue != null ? ` há ${s.days_overdue} dias` : ''}`);
      if (s.current_invoice_value != null) p.push(`valor: R$ ${Number(s.current_invoice_value).toFixed(2)}`);
      if (s.current_invoice_charge_at) p.push(`cobrança: ${s.current_invoice_charge_at}`);
      if (s.current_invoice_payment_url) p.push(`link p/ pagar: ${s.current_invoice_payment_url}`);
      return p.join(' | ');
    });

  if (ctx.contactId) {
    const { data } = await supabaseAdmin
      .from('guru_subscriptions')
      .select(select)
      .eq('contact_id', ctx.contactId)
      .order('updated_at', { ascending: false })
      .limit(3);
    if (data?.length) return fmt(data);
  }
  if (email) {
    const { data } = await supabaseAdmin
      .from('guru_subscriptions')
      .select(select)
      .ilike('subscriber_email', email)
      .order('updated_at', { ascending: false })
      .limit(3);
    if (data?.length) return fmt(data);
  }
  if (ctx.contactPhone) {
    const digits = ctx.contactPhone.replace(/\D/g, '').slice(-8);
    if (digits) {
      const { data } = await supabaseAdmin
        .from('guru_subscriptions')
        .select(select)
        .ilike('subscriber_phone', `%${digits}%`)
        .order('updated_at', { ascending: false })
        .limit(3);
      if (data?.length) return fmt(data);
    }
  }
  return [];
}

/** Registra/atualiza dados pessoais do contato (merge em contacts.metadata.dados). Idempotente. */
async function salvarDadosContato(ctx: AgentContext, input: Record<string, unknown>): Promise<string> {
  if (!ctx.contactId) return 'Não foi possível salvar (contato não identificado).';
  const campos = ['nome_completo', 'cpf', 'telefone', 'endereco', 'email'] as const;
  const novos: Record<string, string> = {};
  for (const f of campos) {
    const v = input?.[f];
    if (typeof v === 'string' && v.trim()) novos[f] = v.trim();
  }
  if (Object.keys(novos).length === 0) return 'Nada para salvar (nenhum dado informado).';

  const { data: c } = await supabaseAdmin
    .from('contacts')
    .select('metadata, email, phone')
    .eq('id', ctx.contactId)
    .maybeSingle();

  const metadata = ((c?.metadata as Record<string, unknown>) || {});
  metadata.dados = { ...((metadata.dados as Record<string, unknown>) || {}), ...novos };

  const update: Record<string, unknown> = { metadata, updated_at: new Date().toISOString() };
  if (novos.email && !(c?.email as string)?.trim()) update.email = novos.email;
  if (novos.telefone && !(c?.phone as string)?.trim()) update.phone = novos.telefone;

  await supabaseAdmin.from('contacts').update(update).eq('id', ctx.contactId);
  return `Dados salvos no cadastro do contato: ${Object.keys(novos).join(', ')}.`;
}

async function execTool(name: string, input: Record<string, unknown>, ctx: AgentContext): Promise<string> {
  switch (name) {
    case 'buscar_conhecimento': {
      const { rows } = await searchKnowledge(String(input?.consulta ?? ''), ctx.brand);
      if (!rows.length) return 'Nenhuma entrada parecida na base de conhecimento.';
      return rows
        .map((r, i) => `${i + 1}. Pergunta-tipo: ${r.question_pattern}\nResposta-ouro: ${r.gold_response}`)
        .join('\n\n');
    }
    case 'buscar_produto': {
      const intencao = String(input?.intencao ?? '');
      const [matches, all] = await Promise.all([
        getMatchingProducts(intencao, ctx.brand),
        listProducts({ is_active: true, brand: ctx.brand || undefined }),
      ]);
      const parts: string[] = [];
      if (matches.length) {
        parts.push('CURSOS QUE MAIS BATEM COM A BUSCA:');
        parts.push(matches.slice(0, 3).map(formatProductForTool).join('\n\n'));
      }
      if (all.length) {
        parts.push(
          'CATÁLOGO COMPLETO (todos os cursos ativos). Confira AQUI antes de dizer que um curso não existe — o nome pode diferir do que o aluno digitou (ex.: "PMBA" = "PM Bahia"):'
        );
        parts.push(all.map(formatProductCompact).join('\n'));
      } else if (!matches.length) {
        parts.push('Catálogo vazio.');
      }
      return parts.join('\n\n');
    }
    case 'consultar_pagamento': {
      const email = input?.email ? String(input.email) : undefined;
      const [rows, subs] = await Promise.all([lookupSales(ctx, email), lookupSubscriptions(ctx, email)]);
      const blocks: string[] = [];
      if (rows.length) {
        blocks.push(
          'Compras avulsas:\n' +
            rows
              .map((s) => {
                const total = s.payment_total != null ? ` | Valor: R$ ${Number(s.payment_total).toFixed(2)}` : '';
                const pay = s.payment_method ? ` | Pagamento: ${s.payment_method}` : '';
                return `Produto: ${s.product_names} | Status: ${s.status ?? 'N/A'} | Data: ${new Date(s.sold_at).toLocaleDateString('pt-BR')}${pay}${total}`;
              })
              .join('\n')
        );
      }
      if (subs.length) blocks.push('Assinaturas/mensalidades:\n' + subs.join('\n'));
      if (!blocks.length) {
        return 'Nenhuma compra ou assinatura encontrada no sistema local para este contato. Para confirmar em tempo real, use consultar_guru_online.';
      }
      return blocks.join('\n\n');
    }
    case 'consultar_guru_online': {
      const email = input?.email ? String(input.email) : undefined;
      const result = await fetchGuruTransactionsLive({ email, phone: ctx.contactPhone });
      if (!result.configured) {
        return 'Consulta ao vivo no Guru não está configurada (falta DIGITAL_GURU_USER_TOKEN/URL). Use os dados locais (consultar_pagamento).';
      }
      if (!result.ok) {
        return `Não consegui consultar o Guru ao vivo agora (${result.error ?? 'erro'}). Use os dados locais (consultar_pagamento) e, se precisar, avise que vai confirmar e retornar.`;
      }
      if (!result.summaries.length) {
        return 'Guru (ao vivo): nenhuma transação encontrada para este e-mail/telefone nos últimos 180 dias.';
      }
      return 'Guru (ao vivo, últimos 180 dias):\n' + result.summaries.join('\n');
    }
    case 'verificar_acesso_plataforma': {
      const r = await diagnosticarAcesso({
        email: input?.email ? String(input.email) : undefined,
        cpf: input?.cpf ? String(input.cpf) : undefined,
      });
      return r.resumo;
    }
    case 'buscar_credenciais': {
      const email = String(input?.email ?? '').trim().toLowerCase();
      if (!email) return 'É preciso o e-mail da compra para localizar o acesso.';
      const creds = await getCredentialsByEmail(email);
      if (!creds.length) return 'Nenhum acesso encontrado para esse e-mail.';
      return creds.map((c) => `${c.platformLabel} — Login: ${c.login} | Senha: ${c.password}`).join('\n');
    }
    case 'salvar_dados_contato':
      return salvarDadosContato(ctx, input);
    case 'classificar_lead': {
      const interesse = String(input?.interesse ?? '').trim();
      if (!interesse) return 'Informe o interesse do lead para classificar.';
      if (!ctx.conversationId) return 'Lead anotado (sem conversa vinculada para registrar).';
      const motivo = String(input?.motivo ?? 'follow_up');
      const obs = String(input?.observacao ?? '').trim();
      await registrarLead(ctx, interesse, motivo, obs);
      return `Lead classificado para follow-up: ${interesse} (${motivo}). Equipe poderá contatá-lo depois.`;
    }
    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}

function buildSystemPrompt(ctx: AgentContext): string {
  const nome = ctx.contactName?.trim() ? ctx.contactName.trim().split(/\s+/)[0] : '';
  return `Você é o copiloto de atendimento do MONSTER CONCURSOS (cursos para concursos) e da FAGENIUS (faculdade, Gestão de Segurança Pública). Sua tarefa: redigir UMA mensagem pronta para o ATENDENTE enviar ao aluno/lead no WhatsApp.
${ctx.memoryBlock ? `\nMEMÓRIA DA CONVERSA (contexto do que já rolou — pode estar resumido; complementa as mensagens abaixo):\n${ctx.memoryBlock}\n` : ''}${ctx.contactDataBlock ? `\nDADOS DO CONTATO (já no cadastro — use no suporte; não peça de novo o que já temos):\n${ctx.contactDataBlock}\n` : ''}
AUTONOMIA — responda de verdade:
- Responda à pergunta que o aluno REALMENTE fez, usando o seu próprio conhecimento quando for dúvida de conteúdo/acadêmica (uma questão, gabarito, matéria, regra de gramática como crase, interpretação, cálculo, etc.). NÃO se limite à base de conhecimento — ela é só apoio.
- Se o aluno enviar uma imagem (print de questão, tela, comprovante), analise a imagem e responda com base no que vê.
- Suposto erro de gabarito/material: analise a questão e dê sua avaliação FUNDAMENTADA (explique o porquê, citando a regra). Se não tiver elementos para ter certeza, diga que vai encaminhar para a equipe pedagógica revisar — não confirme nem negue no chute.

CONVERSA:
- Leia TODA a conversa fornecida (linhas ALUNO e ATENDENTE). Responda apenas a(s) pergunta(s) do aluno que ainda estão EM ABERTO — em especial a última. NÃO repita o que o ATENDENTE já respondeu.
- ${ctx.nowHint || 'Use a saudação conforme o horário do dia (bom dia/boa tarde/boa noite).'} Só cumprimente se a conversa estiver começando; se já estiver em andamento (o atendente já cumprimentou), vá direto ao ponto, sem repetir a saudação.

FERRAMENTAS (use só quando precisar de um dado que você não tem; para dúvida de conteúdo, responda direto):
- buscar_produto: preço, link, o que inclui (interesse em curso).
- consultar_pagamento: situação no sistema (compras avulsas + assinaturas/mensalidades, com atraso e link de fatura). Quando o aluno fala de pagamento/boleto/mensalidade ou diz que comprou.
- consultar_guru_online: confere o pagamento DIRETO no Guru em tempo real (mais confiável). Use se o local não bater ou o aluno contestar; pode demorar alguns segundos.
- verificar_acesso_plataforma: diagnostica se o acesso do aluno está liberado na plataforma (Questões + cursos) e o último webhook. Use quando ele diz que comprou e não recebeu acesso / não consegue acessar.
- buscar_credenciais: acesso/login/senha — só quando o aluno pede E informou o e-mail.
- buscar_conhecimento: procedimentos/FAQ de atendimento.
- classificar_lead: quando NÃO há solução imediata e será preciso contatar o lead depois (o curso/concurso que ele quer não existe no catálogo e ele quer ser avisado no lançamento; pediu retorno futuro). Chame ANTES de redigir e, na mensagem, confirme que vai avisá-lo.
- salvar_dados_contato: registre no cadastro os dados pessoais que o aluno informar (nome completo, CPF, telefone, endereço, e-mail) — para suporte futuro. Só o que ele fornecer; não fique pedindo à toa.

NUNCA invente: não cite e-mail, status, valor, login, nome ou qualquer dado que você não obteve de uma ferramenta ou da conversa. NÃO traga assuntos que o aluno não levantou (ex.: não fale de pagamento, acesso ou e-mail se ele não perguntou sobre isso).

NÃO diga que um curso NÃO existe sem antes conferir o CATÁLOGO COMPLETO de buscar_produto: o aluno costuma usar siglas/abreviações (PMBA = PM Bahia, CBMMG = Bombeiros MG, GCM = Guarda Municipal). Se estiver no catálogo, ofereça-o.

TOM:
- MONSTER: informal, acolhedor, 1–2 emojis no máximo, trate por "você".
- FAGENIUS: formal, profissional, sem emoji.
- Se ambíguo, neutro-profissional.${nome ? `\n- Use o primeiro nome quando fizer sentido: ${nome}.` : ''}

PAGAMENTO: ${PAYMENT_METHODS_INFO}

LINKS: lead interessado/avaliando um curso → PÁGINA DE VENDAS; LINK DE CHECKOUT só quando já decidiu comprar; sem página de vendas, use o checkout.

ACESSO ("comprei e não recebi" / "não consigo acessar"): 1) confirme o pagamento (consultar_pagamento; se preciso, consultar_guru_online); 2) rode verificar_acesso_plataforma com o e-mail da compra; 3) se o acesso JÁ está liberado → oriente entrar e, se esqueceu a senha, redefinir a senha; 4) se está PAGO e DENTRO do prazo mas sem acesso (ou sem cadastro) → diga que vai liberar e que o atendente vai ativar (sem prometer prazo); NÃO afirme que já liberou — quem libera é o atendente. 5) se o acesso JÁ VENCEU (prazo acabou) → NÃO é liberação: oriente renovação/nova compra com gentileza; nunca prometa reativar acesso expirado.

OUTRAS REGRAS:
- Reembolso/cancelamento: oriente a enviar e-mail para atendimento@monsterconcursos.com.br (nome, CPF, e-mail da compra e motivo); prazo de 7 dias (CDC art. 49); resposta em até 48h úteis. Não prometa reembolso.
- Mensagens curtas e diretas (WhatsApp), no máximo 3 parágrafos.

FORMATAÇÃO (WhatsApp, NÃO Markdown): negrito com *um asterisco* (ex.: *Polícia Penal RS*) — NUNCA use ** (dois asteriscos); itálico com _underscore_; nada de títulos (#) ou tabelas.

SAÍDA: responda APENAS com o texto da mensagem para o aluno — sem prefixos, aspas, explicações ou marcadores.`;
}

/**
 * Roda o loop agêntico e devolve o texto sugerido (ou null em caso de falha,
 * para o chamador cair no caminho determinístico).
 */
export async function generateAgenticSuggestion(ctx: AgentContext): Promise<string | null> {
  if (!apiEnv.ANTHROPIC_API_KEY) return null;
  if (!ctx.conversationText?.trim() && !ctx.images?.length) return null;

  const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
  const system = buildSystemPrompt(ctx);

  const textPart = ctx.conversationText?.trim()
    ? `Conversa até agora (ALUNO = aluno/lead; ATENDENTE = você/equipe):\n${ctx.conversationText}\n\nResponda à(s) última(s) pergunta(s) em aberto do aluno, sem repetir o que o ATENDENTE já respondeu.`
    : 'O aluno enviou a(s) imagem(ns) abaixo, sem texto. Analise e redija a mensagem que o atendente deve enviar agora.';

  const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [
    { type: 'text', text: textPart },
  ];
  const imageBlocks = await fetchImageBlocks(ctx.images);
  content.push(...imageBlocks);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content }];

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools,
        messages,
      });

      if (res.stop_reason === 'tool_use') {
        const toolUses = res.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        );
        messages.push({ role: 'assistant', content: res.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          let out: string;
          try {
            out = await execTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, ctx);
          } catch (err) {
            console.error('[IA agent] tool', tu.name, err);
            out = 'Erro ao executar a ferramenta.';
          }
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
        }
        messages.push({ role: 'user', content: results });
        continue;
      }

      // Resposta final
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return text || null;
    }
    console.warn('[IA agent] limite de iterações atingido');
    return null;
  } catch (err) {
    console.error('[IA agent]', err);
    return null;
  }
}
