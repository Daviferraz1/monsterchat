-- Indica se a conversa já foi respondida (tem mensagem outbound do agente)
alter table public.conversations
  add column if not exists last_agent_reply_at timestamptz;

-- Preencher a partir da última mensagem outbound existente
update public.conversations c
set last_agent_reply_at = (
  select max(m.created_at)
  from public.messages m
  where m.conversation_id = c.id
    and m.direction = 'outbound'
    and m.sender_type = 'agent'
)
where exists (
  select 1 from public.messages m
  where m.conversation_id = c.id
    and m.direction = 'outbound'
    and m.sender_type = 'agent'
);
