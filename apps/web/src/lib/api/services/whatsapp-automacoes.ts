/**
 * Resposta automática por palavra-chave no WhatsApp.
 *
 * Nasceu do botão "Receber no WhatsApp" da página do edital: a pessoa chega com
 * uma frase pronta e precisa do material na hora, não quando um atendente abrir
 * a conversa. É o mesmo papel da automação de comentário do Instagram, do lado
 * do WhatsApp.
 *
 * A regra responde UMA vez por contato (`apenas_uma_vez`): o que ela entrega é
 * material, não atendimento. Depois disso, a conversa segue com a equipe ou com
 * a IA, sem repetição.
 */
import { supabaseAdmin } from '../supabase';
import { sendWhatsAppText } from './whatsapp';
import { createMessage } from './message';
import { updateConversation } from './conversation';
import { marcarLinks, slugAutor } from '../rastreio-links';

export interface RegraWhatsapp {
  id: string;
  nome: string;
  palavras: string[];
  mensagem: string;
  apenas_uma_vez: boolean;
}

/** minúsculas, sem acento, espaços simples — igual à automação do Instagram. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Primeira regra cuja palavra aparece inteira no texto.
 * "pmpe" casa com "quero o edital da PMPE!", não com "pmpernambuco".
 */
export function escolherRegra(
  regras: RegraWhatsapp[],
  texto: string
): { regra: RegraWhatsapp; palavra: string } | null {
  const alvo = ` ${normalizar(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const regra of regras) {
    for (const bruta of regra.palavras) {
      const palavra = normalizar(bruta).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (palavra && alvo.includes(` ${palavra} `)) return { regra, palavra };
    }
  }
  return null;
}

interface Entrada {
  channelId: string;
  accessToken: string;
  phoneNumberId: string;
  conversationId: string;
  contactId: string;
  telefone: string;
  texto: string;
}

/**
 * Responde se alguma regra casar. Devolve true quando respondeu — quem chama usa
 * isso para não acionar a IA em cima da mesma mensagem e mandar duas respostas.
 */
export async function responderAutomaticoWhatsapp(entrada: Entrada): Promise<boolean> {
  if (!entrada.texto?.trim()) return false;

  const { data: regras } = await supabaseAdmin
    .from('whatsapp_regras_automaticas')
    .select('id, nome, palavras, mensagem, apenas_uma_vez, channel_id')
    .eq('ativo', true)
    .or(`channel_id.is.null,channel_id.eq.${entrada.channelId}`);

  const achado = escolherRegra((regras ?? []) as RegraWhatsapp[], entrada.texto);
  if (!achado) return false;
  const { regra, palavra } = achado;

  // Reserva antes de enviar: a unique (regra, contato) é quem garante uma só
  // resposta, mesmo se duas mensagens chegarem juntas.
  if (regra.apenas_uma_vez) {
    const { error } = await supabaseAdmin
      .from('whatsapp_regra_envios')
      .insert({
        rule_id: regra.id,
        contact_id: entrada.contactId,
        conversation_id: entrada.conversationId,
        palavra,
      });
    if (error) {
      if (error.code !== '23505') console.error('[WhatsApp automação] falha ao reservar:', error);
      return false; // 23505 = já recebeu esta regra
    }
  }

  const texto = marcarLinks(regra.mensagem, {
    canal: 'whatsapp',
    autor: `automacao-${slugAutor(palavra, 'palavra')}`,
    origem: 'site',
  });

  try {
    const envio = await sendWhatsAppText({
      phoneNumberId: entrada.phoneNumberId,
      accessToken: entrada.accessToken,
      to: entrada.telefone,
      text: texto,
    });

    await createMessage({
      conversationId: entrada.conversationId,
      direction: 'outbound',
      senderType: 'bot',
      contentType: 'text',
      body: texto,
      externalId: envio.messages?.[0]?.id,
      status: 'sent',
      metadata: { via: 'automacao_whatsapp', rule_id: regra.id, palavra },
    });

    await updateConversation(entrada.conversationId, {
      lastMessageAt: new Date().toISOString(),
      lastMessagePreview: `🤖 ${regra.nome}`,
    });

    console.log('[WhatsApp automação] respondeu', { regra: regra.nome, palavra });
    return true;
  } catch (err) {
    console.error('[WhatsApp automação] falha ao enviar:', err);
    // Sem resposta enviada, o registro não pode barrar uma nova tentativa.
    if (regra.apenas_uma_vez) {
      await supabaseAdmin
        .from('whatsapp_regra_envios')
        .delete()
        .eq('rule_id', regra.id)
        .eq('contact_id', entrada.contactId);
    }
    return false;
  }
}
