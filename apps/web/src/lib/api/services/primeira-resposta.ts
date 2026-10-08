/**
 * Primeira resposta automática para quem chega pela mensagem pronta do site.
 *
 * Duas mensagens do site Monster chegam o tempo todo e a resposta é sempre a mesma:
 *  - genérica ("Olá! Quero mais informações sobre os cursos do Monster Concursos"):
 *    o roteiro de abertura da equipe ("qual é o seu objetivo?");
 *  - de página de curso ("…tirar uma dúvida sobre o concurso da GCM de Paulínia."):
 *    a apresentação do curso, já com o link.
 * O atendente só colava o texto (às vezes horas depois). Agora sai na hora, com
 * a saudação do horário e o nome do lead, e a conversa segue com a equipe.
 *
 * Só responde se ninguém escreveu para esse contato nas últimas 24h: é a
 * PRIMEIRA resposta, nunca atropela um atendimento em andamento. Página de
 * concurso sem curso nosso fica para a equipe (a IA registra o lead).
 *
 * Liga/desliga em ia_settings "primeira_resposta_auto" ({ enabled }); ligada se
 * a chave não existir.
 */
import { supabaseAdmin } from '../supabase';
import { sendWhatsAppText } from './whatsapp';
import { createMessage } from './message';
import { updateConversation } from './conversation';
import { listProducts } from '../ia/catalog';
import {
  OPENING_SCRIPT,
  comSaudacao,
  formatSiteLeadReply,
  isGenericOpeningMessage,
  semTravessao,
} from '../ia/team-templates';
import { extractSiteTarget, matchSiteCourses } from '../ia/site-course-match';

const CHAVE = 'primeira_resposta_auto';
const JANELA_MS = 24 * 60 * 60 * 1000;

interface Entrada {
  phoneNumberId: string;
  accessToken: string;
  conversationId: string;
  telefone: string;
  nome: string | null;
  texto: string;
  /** id da mensagem que acabou de chegar (não conta como conversa em andamento). */
  mensagemId: string;
}

async function ligada(): Promise<boolean> {
  const { data } = await supabaseAdmin.from('ia_settings').select('value').eq('key', CHAVE).maybeSingle();
  return (data?.value as { enabled?: boolean } | null)?.enabled !== false;
}

/** Saudação do horário em São Paulo, independente do fuso do servidor. */
export function saudacaoAgora(agora = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora));
  return h < 12 ? 'bom dia' : h < 18 ? 'boa tarde' : 'boa noite';
}

/** O texto da primeira resposta, ou null quando a mensagem não é do site (ou não há curso). */
export async function textoPrimeiraResposta(mensagem: string, nome: string | null, sauda = saudacaoAgora()): Promise<{
  texto: string;
  tipo: 'abertura' | 'curso';
} | null> {
  if (isGenericOpeningMessage(mensagem)) {
    return { texto: semTravessao(comSaudacao(OPENING_SCRIPT, sauda, nome)), tipo: 'abertura' };
  }
  const alvo = extractSiteTarget(mensagem);
  if (!alvo) return null;
  const cursos = matchSiteCourses(alvo, await listProducts({ is_active: true, brand: 'monster' }));
  if (!cursos.length) return null;
  const resposta = formatSiteLeadReply(cursos, sauda);
  return resposta ? { texto: semTravessao(comSaudacao(resposta, sauda, nome)), tipo: 'curso' } : null;
}

/** Responde se for a mensagem pronta do site e ninguém tiver escrito ainda. true = respondeu. */
export async function responderPrimeiroContato(entrada: Entrada): Promise<boolean> {
  if (!entrada.texto?.trim() || !(await ligada())) return false;

  const resposta = await textoPrimeiraResposta(entrada.texto, entrada.nome);
  if (!resposta) return false;

  // Conversa em andamento (qualquer mensagem nossa nas últimas 24h): não é primeira resposta.
  const desde = new Date(Date.now() - JANELA_MS).toISOString();
  const { count } = await supabaseAdmin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', entrada.conversationId)
    .eq('direction', 'outbound')
    .gte('created_at', desde);
  if (count) return false;

  try {
    const envio = await sendWhatsAppText({
      phoneNumberId: entrada.phoneNumberId,
      accessToken: entrada.accessToken,
      to: entrada.telefone,
      text: resposta.texto,
    });
    await createMessage({
      conversationId: entrada.conversationId,
      direction: 'outbound',
      senderType: 'bot',
      contentType: 'text',
      body: resposta.texto,
      externalId: envio.messages?.[0]?.id,
      status: 'sent',
      metadata: { via: 'primeira_resposta_ia', tipo: resposta.tipo, em_resposta_a: entrada.mensagemId },
    });
    await updateConversation(entrada.conversationId, {
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: resposta.texto.slice(0, 120),
    });
    console.log('[Primeira resposta] enviada', { conversationId: entrada.conversationId, tipo: resposta.tipo });
    return true;
  } catch (err) {
    console.error('[Primeira resposta] falha ao enviar:', err);
    return false;
  }
}
