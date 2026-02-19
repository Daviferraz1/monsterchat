-- Adiciona updated_at na tabela messages (PostgREST schema cache exige a coluna)
alter table public.messages
  add column if not exists updated_at timestamptz default now();
