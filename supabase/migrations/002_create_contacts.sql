-- Tabela de contatos
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  channel_type text not null,
  external_id text not null,          -- wa_id ou ig_scoped_user_id
  name text,
  phone text,
  profile_pic_url text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(channel_type, external_id)
);

create index idx_contacts_lookup on contacts(channel_type, external_id);
