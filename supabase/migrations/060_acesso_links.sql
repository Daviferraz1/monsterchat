-- Link de acesso direto à plataforma, enviado pelo WhatsApp.
--
-- O público tem dificuldade com e-mail: não acha a mensagem de boas-vindas, não
-- sabe qual e-mail usou, não lembra a senha. Em 88 de 99 chamados de acesso a
-- conta já existia. Aqui a mensagem do WhatsApp É o acesso: um link curto e
-- nosso (/a/<codigo>) que, no clique, pede ao Supabase da plataforma um link de
-- login (magic link) e redireciona. A pessoa cai no Monster Study logada e
-- define a própria senha — testado em 22/09/2026 sem mudança no front.
--
-- Segurança: o link vai só para o WhatsApp do comprador (mesmo canal da fatura).
-- Vale 7 dias e poucos usos; o link de login do Supabase é gerado só no clique
-- e expira em 1 hora, então ninguém fica com um login eterno guardado. Tudo é
-- revogável e cada abertura fica registrada.
begin;

create table if not exists public.acesso_links (
  id              uuid primary key default gen_random_uuid(),
  -- O que vai na URL. 22 caracteres aleatórios (128 bits), nunca sequencial.
  codigo          text not null unique,
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  -- E-mail da conta na plataforma (o da compra). É por ele que o login é gerado.
  email           text not null,
  origem          text not null check (origem in ('boas_vindas', 'atendente', 'ia')),
  criado_por      uuid,                 -- atendente (auth.users) quando origem = atendente
  transaction_id  text,
  expira_em       timestamptz not null,
  max_usos        integer not null default 5,
  usos            integer not null default 0,
  revogado        boolean not null default false,
  ultimo_uso_em   timestamptz,
  ultimo_erro     text,
  created_at      timestamptz not null default now()
);

comment on table public.acesso_links is
  'Links curtos /a/<codigo> que geram, no clique, um magic link da plataforma. Ver BOAS_VINDAS.md.';

create index if not exists acesso_links_contato_idx on public.acesso_links (contact_id, created_at desc);
create index if not exists acesso_links_email_idx on public.acesso_links (lower(email));

alter table public.acesso_links enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'acesso_links'
                   and policyname = 'acesso_links_leitura') then
    create policy acesso_links_leitura on public.acesso_links
      for select using (auth.uid() is not null);
  end if;
end $$;

-- Boas-vindas com o botão apontando para o link direto (template com URL
-- dinâmica). Nasce desligado: depende do template `acesso_liberado_link`
-- aprovado e de `template_acesso` apontar para ele.
alter table public.boas_vindas_config
  add column if not exists acesso_com_link boolean not null default false,
  add column if not exists link_acesso_base text not null default 'https://chatmonster.monsterconcursos.com.br/a/',
  add column if not exists link_acesso_validade_dias integer not null default 7;

comment on column public.boas_vindas_config.acesso_com_link is
  'true = a mensagem de acesso leva o botão /a/<codigo> (template precisa ter URL dinâmica).';
comment on column public.boas_vindas_config.link_acesso_base is
  'Base pública do link curto. O sufixo é o código; o template guarda a base.';

commit;
