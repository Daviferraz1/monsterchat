-- Tabela de conversas
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id),
  contact_id uuid not null references public.contacts(id),
  status text not null default 'open' check (status in ('open', 'pending', 'closed', 'snoozed')),
  assigned_to uuid references auth.users(id),
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  subject text,
  tags text[] default '{}',
  unread_count integer default 0,
  last_message_at timestamptz,
  last_message_preview text,
  closed_at timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_conversations_status on conversations(status, last_message_at desc);
create index idx_conversations_assigned on conversations(assigned_to, status);
create index idx_conversations_channel_contact on conversations(channel_id, contact_id);
