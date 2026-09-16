-- Conversas abertas só pela automação (ex.: comentário no Instagram → link no direct)
-- ficam fora da caixa de entrada até o lead responder ou alguém da equipe escrever.
-- Elas aparecem na página Automações; quando viram conversa de verdade, voltam ao inbox.

alter table public.conversations
  add column if not exists automacao_pendente boolean not null default false;

comment on column public.conversations.automacao_pendente is
  'true = só há mensagem automática e o lead ainda não respondeu; some do inbox e fica em Automações.';

create index if not exists idx_conversations_automacao_pendente
  on public.conversations (automacao_pendente) where automacao_pendente;

-- Conversas já abertas pela automação e que nunca receberam mensagem do lead.
update public.conversations c
   set automacao_pendente = true
 where exists (select 1 from public.instagram_comment_replies r where r.conversation_id = c.id)
   and not exists (select 1 from public.messages m where m.conversation_id = c.id and m.direction = 'inbound')
   and not exists (select 1 from public.messages m where m.conversation_id = c.id and m.direction = 'outbound' and m.sender_type = 'agent');
