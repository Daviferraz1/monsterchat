/**
 * Segunda mensagem do Instagram: a oferta depois do material gratuito.
 *
 * Quem comenta a palavra-chave recebe o link e some. Esta é a mensagem que volta
 * a falar com essa pessoa — normalmente oferecendo o kit de simulados — e ela é a
 * ponte entre o topo de funil gratuito e a primeira venda.
 *
 * Regras que moldam o desenho:
 *   - a janela de mensagens do Instagram é de 24h a partir da última interação da
 *     pessoa; por isso o intervalo padrão é de 1 hora e nunca passa de 24h;
 *   - quem já respondeu está conversando com a equipe, então não leva oferta
 *     automática — vira `skipped`;
 *   - cada resposta enviada rende no máximo uma mensagem de acompanhamento.
 */
import axios from 'axios';
import { supabaseAdmin } from '../supabase';
import { sendInstagramText } from './instagram';
import { createMessage } from './message';
import { updateConversation } from './conversation';
import { marcarLinks, slugAutor } from '../rastreio-links';

/** A Meta recusa mensagem fora da janela de 24h; 23h dá folga para o cron atrasar. */
const LIMITE_JANELA_MIN = 23 * 60;

interface Pendente {
  id: string;
  channel_id: string;
  rule_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  ig_user_id: string;
  palavra: string | null;
  followup_em: string;
  instagram_comment_rules: { mensagem_followup: string | null } | null;
  conversations: { automacao_pendente: boolean | null } | null;
}

function erroMeta(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const e = err.response?.data?.error;
    return `${e?.code ?? err.response?.status ?? ''} ${e?.message ?? err.message}`.trim();
  }
  return err instanceof Error ? err.message : String(err);
}

/** Momento de enviar a oferta, ou null quando a regra não tem acompanhamento. */
export function agendarFollowup(regra: {
  mensagem_followup?: string | null;
  followup_minutos?: number | null;
}): string | null {
  if (!regra.mensagem_followup?.trim()) return null;
  const minutos = Math.min(Math.max(regra.followup_minutos ?? 60, 1), LIMITE_JANELA_MIN);
  return new Date(Date.now() + minutos * 60_000).toISOString();
}

/**
 * Envia as ofertas que já venceram. Idempotente: marca a linha antes de enviar,
 * então duas execuções simultâneas não mandam a mesma mensagem duas vezes.
 */
export async function enviarFollowupsPendentes(limite = 25) {
  const { data, error } = await supabaseAdmin
    .from('instagram_comment_replies')
    .select(
      'id, channel_id, rule_id, contact_id, conversation_id, ig_user_id, palavra, followup_em,' +
        ' instagram_comment_rules(mensagem_followup),' +
        ' conversations(automacao_pendente)'
    )
    .eq('status', 'sent')
    .is('followup_status', null)
    .not('followup_em', 'is', null)
    .lte('followup_em', new Date().toISOString())
    .order('followup_em', { ascending: true })
    .limit(limite);

  if (error) {
    console.error('[IG followup] falha ao listar pendentes:', error);
    return { enviados: 0, pulados: 0, falhas: 0 };
  }

  const pendentes = (data ?? []) as unknown as Pendente[];
  let enviados = 0;
  let pulados = 0;
  let falhas = 0;

  for (const p of pendentes) {
    const texto = p.instagram_comment_rules?.mensagem_followup?.trim();
    const marcar = (dados: Record<string, unknown>) =>
      supabaseAdmin.from('instagram_comment_replies').update(dados).eq('id', p.id);

    // Respondeu? Está falando com a equipe: oferta automática só atrapalha.
    const conversando = p.conversations && p.conversations.automacao_pendente === false;
    const vencida = Date.now() - new Date(p.followup_em).getTime() > LIMITE_JANELA_MIN * 60_000;

    if (!texto || conversando || vencida) {
      await marcar({
        followup_status: 'skipped',
        followup_erro: !texto ? 'sem mensagem' : conversando ? 'lead respondeu' : 'fora da janela',
      });
      pulados += 1;
      continue;
    }

    // Reserva antes de enviar: se outra execução vier junto, ela não repete.
    const { data: reservada } = await supabaseAdmin
      .from('instagram_comment_replies')
      .update({ followup_status: 'sending' })
      .eq('id', p.id)
      .is('followup_status', null)
      .select('id')
      .maybeSingle();
    if (!reservada) continue;

    const { data: canal } = await supabaseAdmin
      .from('channels')
      .select('id, access_token, external_id')
      .eq('id', p.channel_id)
      .single();

    if (!canal?.access_token) {
      await marcar({ followup_status: 'failed', followup_erro: 'canal sem token' });
      falhas += 1;
      continue;
    }

    const corpo = marcarLinks(texto, {
      canal: 'instagram',
      autor: `followup-${slugAutor(p.palavra ?? 'comentario', 'palavra')}`,
      origem: 'instagram',
    });

    try {
      const envio = await sendInstagramText({
        pageId: canal.external_id ?? undefined,
        accessToken: canal.access_token,
        recipientId: p.ig_user_id,
        text: corpo,
      });

      if (p.conversation_id) {
        await createMessage({
          conversationId: p.conversation_id,
          direction: 'outbound',
          senderType: 'bot',
          contentType: 'text',
          body: corpo,
          externalId: envio.message_id,
          status: 'sent',
          metadata: { via: 'followup_instagram', rule_id: p.rule_id },
        });
        await updateConversation(p.conversation_id, {
          lastMessageAt: new Date().toISOString(),
          lastMessagePreview: '🤖 Oferta enviada após o material',
        });
      }

      await marcar({ followup_status: 'sent', followup_erro: null });
      enviados += 1;
    } catch (err) {
      const msg = erroMeta(err);
      await marcar({ followup_status: 'failed', followup_erro: msg.slice(0, 500) });
      console.error('[IG followup] falha ao enviar:', { id: p.id, msg });
      falhas += 1;
    }
  }

  return { enviados, pulados, falhas };
}
