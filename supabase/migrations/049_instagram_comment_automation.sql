-- Resposta automática a comentários do Instagram (substitui o ManyChat).
--
-- Quem comenta a palavra-chave num post recebe a mensagem no direct pela "private reply"
-- da Meta (uma por comentário, até 7 dias depois dele) e, se a regra pedir, uma resposta
-- pública no próprio comentário. A conversa entra na caixa de entrada como qualquer outra.
--
-- Acesso só pelas rotas de servidor (service role): RLS ligado e sem policy.

create table if not exists public.instagram_comment_rules (
  id               uuid primary key default gen_random_uuid(),
  channel_id       uuid not null references public.channels(id) on delete cascade,
  nome             text not null,
  -- Casamento sem diferenciar maiúscula/acento; basta o comentário conter uma delas.
  palavras         text[] not null check (array_length(palavras, 1) >= 1),
  -- Nulo = vale para qualquer post da conta.
  media_id         text,
  mensagem_direct  text not null check (length(mensagem_direct) between 1 and 1000),
  resposta_publica text check (resposta_publica is null or length(resposta_publica) <= 300),
  ativo            boolean not null default true,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_ig_comment_rules_canal_ativo
  on public.instagram_comment_rules (channel_id) where ativo;

-- Um registro por comentário processado: é o que impede responder duas vezes
-- (a Meta reenvia webhook) e alimenta o relatório por palavra-chave.
create table if not exists public.instagram_comment_replies (
  id                uuid primary key default gen_random_uuid(),
  comment_id        text not null unique,
  channel_id        uuid references public.channels(id) on delete set null,
  rule_id           uuid references public.instagram_comment_rules(id) on delete set null,
  media_id          text,
  ig_user_id        text,
  username          text,
  comment_text      text,
  palavra           text,
  contact_id        uuid references public.contacts(id) on delete set null,
  conversation_id   uuid references public.conversations(id) on delete set null,
  status            text not null check (status in ('sent', 'failed', 'expired')),
  error             text,
  public_reply_id   text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ig_comment_replies_regra_data
  on public.instagram_comment_replies (rule_id, created_at desc);

alter table public.instagram_comment_rules   enable row level security;
alter table public.instagram_comment_replies enable row level security;

comment on table public.instagram_comment_rules is
  'Palavra-chave em comentário do Instagram → mensagem no direct (+ resposta pública opcional).';
comment on table public.instagram_comment_replies is
  'Comentários já respondidos pela automação (um por comment_id).';
