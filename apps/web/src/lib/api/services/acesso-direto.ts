/**
 * Link de acesso direto à plataforma (Monster Study / Questões), pelo WhatsApp.
 *
 * O aluno recebe um link curto e nosso — /a/<codigo>. No clique, pedimos ao
 * Supabase da plataforma um magic link para o e-mail da compra e redirecionamos.
 * A pessoa cai no Monster Study logada e a tela pede para definir a senha
 * (comportamento do front, testado em 22/09/2026 sem nenhuma mudança lá).
 *
 * Por que dois níveis de link: o magic link do Supabase vale 1 hora e é de uso
 * único — péssimo para quem abre o WhatsApp à noite. O nosso vale 7 dias e
 * gera um magic link novo a cada clique, dentro de um teto de usos. O que fica
 * guardado no celular da pessoa é o nosso código, não um login.
 *
 * Quem pode criar: as boas-vindas (na compra), o atendente (botão na conversa)
 * e, depois, a IA. Sem a integração da plataforma configurada
 * (PLATFORM_SUPABASE_*), nada aqui funciona — e diz isso em vez de fingir.
 */
import { randomBytes } from 'crypto';
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';
import { isPlatformEnabled } from '../integrations/platform-access';
import { sendWhatsAppText } from './whatsapp';
import { createMessage } from './message';
import { findOrCreateConversation, updateConversation } from './conversation';

export type OrigemLink = 'boas_vindas' | 'atendente' | 'ia' | 'onboarding';

/** Para onde o magic link manda depois de validar. Precisa estar na allow-list do Auth da plataforma. */
const REDIRECT_PLATAFORMA = 'https://www.monsterstudy.com.br/';
const VALIDADE_PADRAO_DIAS = 7;
const MAX_USOS_PADRAO = 5;

interface LinhaLink {
  id: string;
  codigo: string;
  contact_id: string | null;
  conversation_id: string | null;
  email: string;
  expira_em: string;
  max_usos: number;
  usos: number;
  revogado: boolean;
}

function gerarCodigo(): string {
  // 16 bytes → 22 caracteres base64url. Não é adivinhável nem sequencial.
  return randomBytes(16).toString('base64url');
}

async function linkBase(): Promise<string> {
  const { data } = await supabaseAdmin.from('boas_vindas_config').select('link_acesso_base').limit(1).maybeSingle();
  const base = (data as { link_acesso_base?: string } | null)?.link_acesso_base;
  return (base || 'https://chatmonster.monsterconcursos.com.br/a/').replace(/\/?$/, '/');
}

/**
 * A conta existe na plataforma? Consulta a tabela User do 2º Supabase pelo e-mail.
 * `null` = não deu para saber; o motivo vai em `erro`, porque "falhou" sem o
 * código HTTP não diz se a chave está errada ou a plataforma caiu.
 */
export async function contaExiste(email: string): Promise<{ existe: boolean | null; erro?: string }> {
  const base = apiEnv.PLATFORM_SUPABASE_URL?.replace(/\/$/, '');
  const key = apiEnv.PLATFORM_SUPABASE_SERVICE_KEY;
  if (!base || !key) return { existe: null, erro: 'PLATFORM_SUPABASE_* não configurados' };
  try {
    const res = await fetch(`${base}/rest/v1/User?email=ilike.${encodeURIComponent(email)}&select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const corpo = (await res.text().catch(() => '')).slice(0, 160);
      return { existe: null, erro: `User: HTTP ${res.status} ${corpo}` };
    }
    const rows = (await res.json()) as unknown[];
    return { existe: rows.length > 0 };
  } catch (err) {
    return { existe: null, erro: `User: ${err instanceof Error ? err.message : 'erro de rede'}` };
  }
}

/**
 * Cria o link curto. Não exige que a conta já exista: nas boas-vindas, o
 * webhook da plataforma pode ainda estar criando o usuário — a checagem fica
 * para o clique, onde ela faz diferença.
 */
export async function criarLinkAcesso(params: {
  email: string;
  contactId?: string | null;
  conversationId?: string | null;
  origem: OrigemLink;
  criadoPor?: string | null;
  transactionId?: string | null;
  validadeDias?: number;
}): Promise<{ ok: true; codigo: string; url: string; expiraEm: string } | { ok: false; message: string }> {
  if (!isPlatformEnabled()) {
    return { ok: false, message: 'Integração da plataforma não configurada (PLATFORM_SUPABASE_*).' };
  }
  const email = params.email.trim().toLowerCase();
  if (!email.includes('@')) return { ok: false, message: 'E-mail da compra inválido.' };

  const codigo = gerarCodigo();
  const expiraEm = new Date(Date.now() + (params.validadeDias ?? VALIDADE_PADRAO_DIAS) * 86400_000).toISOString();
  const { error } = await supabaseAdmin.from('acesso_links').insert({
    codigo,
    contact_id: params.contactId ?? null,
    conversation_id: params.conversationId ?? null,
    email,
    origem: params.origem,
    criado_por: params.criadoPor ?? null,
    transaction_id: params.transactionId ?? null,
    expira_em: expiraEm,
    max_usos: MAX_USOS_PADRAO,
  });
  if (error) {
    console.error('[Acesso direto] falha ao gravar link:', error);
    return { ok: false, message: 'Falha ao gerar o link.' };
  }
  return { ok: true, codigo, url: `${await linkBase()}${codigo}`, expiraEm };
}

export type ResultadoClique =
  | { ok: true; destino: string }
  | { ok: false; motivo: 'nao_encontrado' | 'expirado' | 'esgotado' | 'revogado' | 'sem_conta' | 'plataforma_indisponivel' };

/**
 * O clique: valida o código, pede o magic link à plataforma e devolve o destino.
 * Conta o uso ANTES de gerar, para dois cliques simultâneos não estourarem o teto.
 */
export async function resolverLink(codigo: string): Promise<ResultadoClique> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(codigo)) return { ok: false, motivo: 'nao_encontrado' };

  const { data } = await supabaseAdmin
    .from('acesso_links')
    .select('id, codigo, contact_id, conversation_id, email, expira_em, max_usos, usos, revogado')
    .eq('codigo', codigo)
    .maybeSingle();
  const link = data as LinhaLink | null;
  if (!link) return { ok: false, motivo: 'nao_encontrado' };
  if (link.revogado) return { ok: false, motivo: 'revogado' };
  if (new Date(link.expira_em).getTime() < Date.now()) return { ok: false, motivo: 'expirado' };
  if (link.usos >= link.max_usos) return { ok: false, motivo: 'esgotado' };

  const registrar = (campos: Record<string, unknown>) =>
    supabaseAdmin.from('acesso_links').update({ ultimo_uso_em: new Date().toISOString(), ...campos }).eq('id', link.id);

  const base = apiEnv.PLATFORM_SUPABASE_URL?.replace(/\/$/, '');
  const key = apiEnv.PLATFORM_SUPABASE_SERVICE_KEY;
  if (!base || !key) {
    // Fica no registro: "não conseguimos entrar agora" na tela não diz se o
    // problema é configuração ou a plataforma fora do ar.
    await registrar({ ultimo_erro: 'PLATFORM_SUPABASE_URL/SERVICE_KEY não configurados neste ambiente' });
    return { ok: false, motivo: 'plataforma_indisponivel' };
  }

  // Conferir a conta ANTES de pedir o link: o `generate_link` de magiclink CRIA
  // o usuário quando o e-mail não existe (visto no teste de 22/09/2026). Um
  // link de acesso não pode virar um cadastro vazio na plataforma.
  const conta = await contaExiste(link.email);
  if (conta.existe === null) {
    await registrar({ ultimo_erro: (conta.erro || 'falha ao consultar a plataforma').slice(0, 300) });
    return { ok: false, motivo: 'plataforma_indisponivel' };
  }
  if (!conta.existe) {
    await registrar({ ultimo_erro: 'sem conta na plataforma' });
    return { ok: false, motivo: 'sem_conta' };
  }

  try {
    const res = await fetch(`${base}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: link.email, redirect_to: REDIRECT_PLATAFORMA }),
      cache: 'no-store',
    });
    const corpo = (await res.json().catch(() => ({}))) as { action_link?: string; msg?: string; message?: string; error_description?: string };
    if (!res.ok || !corpo.action_link) {
      const erro = corpo.msg || corpo.message || corpo.error_description || `HTTP ${res.status}`;
      await registrar({ ultimo_erro: erro.slice(0, 300) });
      // 404/422 "user not found": a conta ainda não existe para este e-mail.
      const semConta = res.status === 404 || res.status === 422 || /not found|não encontrad/i.test(erro);
      return { ok: false, motivo: semConta ? 'sem_conta' : 'plataforma_indisponivel' };
    }
    await registrar({ usos: link.usos + 1, ultimo_erro: null });
    return { ok: true, destino: corpo.action_link };
  } catch (err) {
    console.error('[Acesso direto] falha ao gerar magic link:', err);
    await registrar({ ultimo_erro: err instanceof Error ? err.message.slice(0, 300) : 'erro' });
    return { ok: false, motivo: 'plataforma_indisponivel' };
  }
}

/**
 * Ação do atendente: gera o link e manda como texto na conversa do contato.
 *
 * Texto livre só passa dentro da janela de 24h desde a última mensagem da
 * pessoa. Fora dela a Meta recusa (#131047) — e a resposta diz isso, em vez de
 * falhar em silêncio. Como o botão vive numa conversa aberta, é o caso raro.
 */
export async function enviarLinkNaConversa(params: {
  contactId: string;
  conversationId?: string | null;
  criadoPor?: string | null;
  origem?: OrigemLink;
}): Promise<{ ok: boolean; message: string; url?: string }> {
  const { data: contato } = await supabaseAdmin
    .from('contacts')
    .select('id, name, email, phone, external_id')
    .eq('id', params.contactId)
    .maybeSingle();
  if (!contato) return { ok: false, message: 'Contato não encontrado.' };
  if (!contato.email) return { ok: false, message: 'Sem e-mail no cadastro. Peça o e-mail da compra e salve no contato.' };
  const telefone = contato.phone || contato.external_id;
  if (!telefone) return { ok: false, message: 'Contato sem telefone de WhatsApp.' };

  const conta = await contaExiste(contato.email);
  if (conta.existe === null) {
    return { ok: false, message: `Não consegui consultar a plataforma agora (${conta.erro || 'erro'}). Tente de novo em instantes.` };
  }
  if (conta.existe === false) {
    return { ok: false, message: `Não há conta na plataforma para ${contato.email}. Confira o e-mail da compra ou use "Liberar acesso".` };
  }

  const { data: canal } = await supabaseAdmin
    .from('channels')
    .select('id, external_id, access_token')
    .eq('type', 'whatsapp')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (!canal?.access_token || !canal.external_id) return { ok: false, message: 'Canal de WhatsApp sem token.' };

  const conversa = params.conversationId
    ? { id: params.conversationId }
    : await findOrCreateConversation({ channelId: canal.id, contactId: contato.id });

  const link = await criarLinkAcesso({
    email: contato.email,
    contactId: contato.id,
    conversationId: conversa.id,
    origem: params.origem ?? 'atendente',
    criadoPor: params.criadoPor ?? null,
  });
  if (!link.ok) return link;

  const nome = (contato.name || '').trim().split(/\s+/)[0] || '';
  const texto =
    `${nome ? `Oi, ${nome}! ` : 'Oi! '}Aqui está seu acesso à plataforma:\n${link.url}\n\n` +
    `É só tocar no link para entrar. Na primeira vez, a plataforma pede para você criar uma senha.\n` +
    `O link vale por 7 dias e é só seu — não compartilhe.`;

  try {
    const envio = await sendWhatsAppText({
      phoneNumberId: canal.external_id,
      accessToken: canal.access_token,
      to: telefone,
      text: texto,
    });
    await createMessage({
      conversationId: conversa.id,
      direction: 'outbound',
      senderType: 'agent',
      agentUserId: params.criadoPor ?? null,
      contentType: 'text',
      body: texto,
      externalId: envio.messages?.[0]?.id,
      status: 'sent',
      metadata: { via: 'acesso_direto', codigo: link.codigo, email: contato.email },
    });
    await updateConversation(conversa.id, {
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: 'Link de acesso à plataforma',
      lastAgentReplyAt: new Date().toISOString(),
    });
    return { ok: true, message: 'Link enviado na conversa.', url: link.url };
  } catch (err) {
    const detalhe = (err as { response?: { data?: { error?: { code?: number; message?: string } } } })?.response?.data?.error;
    console.error('[Acesso direto] falha ao enviar:', detalhe ?? err);
    if (detalhe?.code === 131047) {
      return {
        ok: false,
        message: 'A pessoa não fala no WhatsApp há mais de 24h e a Meta recusa texto livre. Peça para ela mandar um "oi" e envie de novo.',
        url: link.url,
      };
    }
    return { ok: false, message: `Falha ao enviar: ${detalhe?.message ?? 'erro na Meta'}.`, url: link.url };
  }
}
