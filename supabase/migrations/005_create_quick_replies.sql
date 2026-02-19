-- Tabela de respostas rápidas
create table public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  shortcut text unique,              -- ex: /ola, /preco
  body text not null,
  category text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_quick_replies_shortcut on quick_replies(shortcut);
create index idx_quick_replies_category on quick_replies(category);
