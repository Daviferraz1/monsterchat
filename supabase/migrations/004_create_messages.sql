-- Tabela de mensagens
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('contact', 'agent', 'system', 'bot')),
  sender_id text,                     -- agent user id ou contact external id
  content_type text not null default 'text'
    check (content_type in ('text','image','video','audio','document','sticker','location','contact_card','story_mention','story_reply','template','interactive','reaction')),
  body text,
  media_url text,
  media_mime_type text,
  media_filename text,
  media_size integer,
  external_id text,                   -- message id retornado pela Meta
  status text default 'pending'
    check (status in ('pending','sent','delivered','read','failed')),
  error_message text,
  reply_to_id uuid references public.messages(id),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_messages_conversation_created on messages(conversation_id, created_at desc);
create index idx_messages_external_id on messages(external_id) where external_id is not null;
create index idx_messages_status on messages(status, created_at desc);
