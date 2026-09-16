/**
 * Comentário com palavra-chave no Instagram → link no direct (substitui o ManyChat).
 *
 * Fluxo: webhook `comments` → regra ativa que casa com o texto → resposta privada
 * (a mensagem chega no direct de quem comentou) → conversa no inbox com origem
 * gravada → resposta pública opcional no comentário. Cada comentário é processado
 * uma vez só (unique em instagram_comment_replies.comment_id), porque a Meta
 * reenvia webhook.
 */
import axios from 'axios';
import { supabaseAdmin } from '../supabase';
import { upsertContact } from './contact';
import { findOrCreateConversation, updateConversation } from './conversation';
import { createMessage } from './message';
import { replyToInstagramComment, sendInstagramPrivateReply } from './instagram';
import { marcarLinks, slugAutor } from '../rastreio-links';

export interface InstagramCommentEvent {
  id: string;
  text?: string;
  parent_id?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
}

interface Canal {
  id: string;
  access_token: string;
  external_id?: string | null;
}

export interface RegraComentario {
  id: string;
  nome: string;
  palavras: string[];
  media_id: string | null;
  mensagem_direct: string;
  resposta_publica: string | null;
}

/** minúsculas, sem acento, espaços simples. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Regra que vale para o comentário: primeiro as do post específico, depois as gerais.
 * A palavra precisa aparecer inteira ("pcba" casa com "quero PCBA!", não com "pcbahia").
 */
export function escolherRegra(
  regras: RegraComentario[],
  texto: string,
  mediaId?: string
): { regra: RegraComentario; palavra: string } | null {
  const alvo = ` ${normalizar(texto).replace(/[^a-z0-9 ]/g, ' ')} `;
  const ordenadas = [
    ...regras.filter((r) => r.media_id && r.media_id === mediaId),
    ...regras.filter((r) => !r.media_id),
  ];
  for (const regra of ordenadas) {
    for (const bruta of regra.palavras) {
      const palavra = normalizar(bruta).replace(/[^a-z0-9 ]/g, ' ').trim();
      if (palavra && alvo.includes(` ${palavra} `)) return { regra, palavra };
    }
  }
  return null;
}

function erroMeta(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const e = err.response?.data?.error;
    return `${e?.code ?? err.response?.status ?? ''} ${e?.message ?? err.message}`.trim();
  }
  return err instanceof Error ? err.message : String(err);
}

export async function processInstagramComment(
  evento: InstagramCommentEvent,
  canal: Canal,
  contaId: string
): Promise<void> {
  const autor = evento.from;
  if (!evento.id || !evento.text || !autor?.id) return;
  if (autor.id === contaId || autor.id === canal.external_id) return; // comentário da própria conta

  const { data: regras } = await supabaseAdmin
    .from('instagram_comment_rules')
    .select('id, nome, palavras, media_id, mensagem_direct, resposta_publica')
    .eq('channel_id', canal.id)
    .eq('ativo', true);
  const achado = escolherRegra((regras ?? []) as RegraComentario[], evento.text, evento.media?.id);
  if (!achado) return;
  const { regra, palavra } = achado;

  // Reserva o comentário antes de enviar: se o webhook vier duplicado, o segundo para aqui.
  const { data: reserva, error: erroReserva } = await supabaseAdmin
    .from('instagram_comment_replies')
    .insert({
      comment_id: evento.id,
      channel_id: canal.id,
      rule_id: regra.id,
      media_id: evento.media?.id ?? null,
      ig_user_id: autor.id,
      username: autor.username ?? null,
      comment_text: evento.text.slice(0, 1000),
      palavra,
      status: 'failed',
      error: 'processando',
    })
    .select('id')
    .single();
  if (erroReserva || !reserva) {
    if (erroReserva?.code !== '23505') console.error('[IG comentário] Falha ao reservar:', erroReserva);
    return;
  }

  const texto = marcarLinks(regra.mensagem_direct, {
    canal: 'instagram',
    autor: `comentario-${slugAutor(palavra, 'palavra')}`,
    origem: 'instagram',
  });

  const atualizar = (dados: Record<string, unknown>) =>
    supabaseAdmin.from('instagram_comment_replies').update(dados).eq('id', reserva.id);

  let envio: { recipient_id?: string; message_id?: string };
  try {
    envio = await sendInstagramPrivateReply({
      pageId: canal.external_id ?? undefined,
      accessToken: canal.access_token,
      commentId: evento.id,
      text: texto,
    });
  } catch (err) {
    const msg = erroMeta(err);
    const expirado = /7 days|expired|too old|outside of allowed window/i.test(msg);
    await atualizar({ status: expirado ? 'expired' : 'failed', error: msg.slice(0, 500) });
    console.error('[IG comentário] Resposta privada falhou:', { commentId: evento.id, msg });
    return;
  }

  // Conversa no inbox, com a origem do lead (primeiro toque).
  const igsid = envio.recipient_id || autor.id;
  let contactId: string | null = null;
  let conversationId: string | null = null;
  try {
    const { data: existente } = await supabaseAdmin
      .from('contacts')
      .select('id, metadata')
      .eq('channel_type', 'instagram')
      .eq('external_id', igsid)
      .maybeSingle();
    const jaTemOrigem = Boolean((existente?.metadata as Record<string, unknown> | null)?.campaign);
    const contato = await upsertContact({
      channelType: 'instagram',
      externalId: igsid,
      name: autor.username ? `@${autor.username}` : `Instagram ${igsid.slice(-6)}`,
      nameIsFallback: true,
      metadata: autor.username ? { username: autor.username } : undefined,
      campaign: jaTemOrigem
        ? undefined
        : {
            utm_source: 'instagram',
            utm_medium: 'comentario',
            utm_campaign: palavra,
            utm_content: evento.media?.id,
          },
    });
    contactId = contato.id;
    const conversa = await findOrCreateConversation({ channelId: canal.id, contactId: contato.id });
    conversationId = conversa.id;
    await createMessage({
      conversationId: conversa.id,
      direction: 'outbound',
      senderType: 'bot',
      contentType: 'text',
      body: texto,
      externalId: envio.message_id,
      status: 'sent',
      metadata: { via: 'comentario_instagram', comment_id: evento.id, rule_id: regra.id, palavra },
    });
    const agora = new Date().toISOString();
    await updateConversation(conversa.id, {
      lastMessageAt: agora,
      lastMessagePreview: `💬 Comentou "${evento.text.slice(0, 40)}" → link enviado`,
    });
  } catch (err) {
    // O direct já foi; falha aqui só afeta o registro no inbox.
    console.error('[IG comentário] Direct enviado, mas falhou ao registrar no inbox:', err);
  }

  let publicReplyId: string | null = null;
  if (regra.resposta_publica?.trim()) {
    try {
      const r = await replyToInstagramComment({
        accessToken: canal.access_token,
        commentId: evento.id,
        message: regra.resposta_publica.trim(),
      });
      publicReplyId = r.id ?? null;
    } catch (err) {
      console.warn('[IG comentário] Resposta pública falhou:', erroMeta(err));
    }
  }

  await atualizar({
    status: 'sent',
    error: null,
    contact_id: contactId,
    conversation_id: conversationId,
    public_reply_id: publicReplyId,
  });
  console.log('[IG comentário] Link enviado no direct', { commentId: evento.id, regra: regra.nome, palavra });
}
