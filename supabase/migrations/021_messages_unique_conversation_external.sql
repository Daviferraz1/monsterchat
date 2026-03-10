-- Evita duplicação de mensagens (ex.: Baileys emite o mesmo message.upsert várias vezes)
-- Remove duplicatas existentes (mantém a mais antiga por conversation_id + external_id)
delete from public.messages
where id in (
  select id from (
    select id,
      row_number() over (partition by conversation_id, external_id order by created_at asc) as rn
    from public.messages
    where external_id is not null
  ) t
  where t.rn > 1
);

create unique index idx_messages_conversation_external_unique
  on public.messages(conversation_id, external_id)
  where external_id is not null;
