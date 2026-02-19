-- Preenche last_message_preview nas conversas que têm mensagens mas prévia vazia
update public.conversations c
set last_message_preview = coalesce(
  (
    select case
      when m.body is not null and trim(m.body) <> '' then m.body
      else '[' || m.content_type || ']'
    end
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ),
  c.last_message_preview
),
updated_at = now()
where c.last_message_at is not null
  and (c.last_message_preview is null or trim(c.last_message_preview) = '');
