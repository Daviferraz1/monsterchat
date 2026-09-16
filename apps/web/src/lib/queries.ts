/**
 * Colunas pedidas ao Supabase nas telas que recarregam sozinhas.
 *
 * Antes era `*, contact:contacts(*), channel:channels(*)`: vinha tudo, inclusive
 * campos que nenhuma tela lê. Como isso desce por dados móveis várias vezes por
 * minuto, cada coluna a mais custa dinheiro do atendente — daí a lista explícita.
 *
 * Se uma tela precisar de um campo que não está aqui, some ao select em vez de
 * voltar para o `*`: o `*` traz junto os blobs de `metadata`, que são o grosso
 * do peso.
 */

/**
 * Conversa como a lista e o quadro precisam dela.
 *
 * Fora daqui de propósito: `metadata`, `tags` e `subject` (ninguém lê na lista),
 * `created_at`/`updated_at`/`first_response_at`/`assigned_by` (idem) e, no
 * contato, `email` e `notes` — a observação pode ser um texto longo e só aparece
 * na ficha, dentro do chat.
 *
 * `contacts.metadata` fica porque a lista lê três chaves dele: `username`
 * (Instagram), `digital_guru` (selo de situação) e `campaign` (lead de anúncio).
 *
 * O canal vem só com o que o badge usa. É o campo que mais pesava: a linha
 * inteira do canal, `metadata` incluso, era repetida em toda conversa da lista.
 */
export const CONVERSATION_LIST_SELECT = `
  id,
  contact_id,
  channel_id,
  status,
  priority,
  assigned_to,
  assigned_at,
  department_id,
  unread_count,
  manually_unread,
  last_message_at,
  last_message_preview,
  last_agent_reply_at,
  closed_at,
  contact:contacts(id, name, phone, external_id, profile_pic_url, metadata),
  channel:channels(id, type, name)
`;

/**
 * Mensagem como o chat precisa dela.
 *
 * `metadata` não vem inteiro: nele fica o payload cru do webhook da Meta
 * (`rawPayload`), que sozinho era perto de metade do peso do histórico e que a
 * tela não usa. Das duas chaves que o chat de fato lê — o alvo da reação, que o
 * WhatsApp põe em `metadata.reaction` e o Instagram em `metadata.mid` — pedimos
 * só elas, já com nome próprio.
 */
export const MESSAGE_SELECT = `
  id,
  conversation_id,
  direction,
  sender_type,
  sender_id,
  agent_user_id,
  content_type,
  body,
  media_url,
  media_mime_type,
  media_filename,
  media_size,
  external_id,
  status,
  error_message,
  reply_to_id,
  created_at,
  reaction_meta:metadata->reaction,
  reaction_mid:metadata->>mid
`;

/**
 * Só o necessário para `needsReply` — o badge de "não respondidas".
 *
 * O badge conta sobre a fila inteira, não sobre a página que está na tela, então
 * esta consulta não pode ser paginada. Por isso ela leva apenas as quatro datas
 * e o status: são ~150 bytes por conversa contra ~825 da linha da lista.
 *
 * O jeito de zerar este custo seria uma coluna gerada `needs_reply` no banco,
 * para o badge virar um `count` — hoje não dá, porque a regra compara duas
 * colunas entre si e o PostgREST não expressa isso num filtro.
 */
export const CONVERSATION_BADGE_SELECT = 'id, status, closed_at, last_message_at, last_agent_reply_at';

/** Conversas carregadas por vez na lista; o resto vem no "Carregar mais". */
export const CONVERSATIONS_PAGE = 100;

/** Mensagens carregadas ao abrir o chat; as antigas vêm ao rolar para cima. */
export const MESSAGES_PAGE = 50;
