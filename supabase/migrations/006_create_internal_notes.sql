-- Tabela de notas internas
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz default now()
);

create index idx_internal_notes_conversation on internal_notes(conversation_id, created_at desc);
