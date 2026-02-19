-- Tabela de canais (WhatsApp e Instagram)
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('whatsapp', 'instagram')),
  name text not null,
  external_id text not null,          -- phone_number_id (WA) ou ig_user_id (IG)
  business_account_id text,           -- waba_id ou page_id
  access_token text not null,
  webhook_verify_token text,
  is_active boolean default true,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_channels_type_active on channels(type, is_active);
create index idx_channels_external_id on channels(type, external_id);
