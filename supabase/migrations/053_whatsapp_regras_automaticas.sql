-- Resposta automática por palavra-chave no WhatsApp.
--
-- A página do edital manda a pessoa para o WhatsApp com uma frase pronta
-- ("Quero o edital verticalizado da PM PE"). Sem automação, esse lead fica
-- esperando um atendente — e o material que ele veio buscar chega tarde ou não
-- chega. Estas regras respondem na hora, como a automação de comentário do
-- Instagram faz no direct.
--
-- `apenas_uma_vez` existe porque a resposta é um material, não um atendimento:
-- quem já recebeu não deve receber de novo a cada mensagem parecida.

begin;

create table if not exists public.whatsapp_regras_automaticas (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid references public.channels(id) on delete cascade,
  nome          text not null,
  palavras      text[] not null default '{}',
  mensagem      text not null,
  ativo         boolean not null default true,
  apenas_uma_vez boolean not null default true,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.whatsapp_regras_automaticas is
  'Respostas automáticas do WhatsApp por palavra-chave. channel_id nulo = vale para todos os canais.';

-- Histórico de envio: é o que impede repetir o material para o mesmo contato e
-- o que permite medir quantos leads a automação atendeu.
create table if not exists public.whatsapp_regra_envios (
  id              uuid primary key default gen_random_uuid(),
  rule_id         uuid not null references public.whatsapp_regras_automaticas(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  palavra         text,
  created_at      timestamptz not null default now(),
  constraint whatsapp_regra_envios_unico unique (rule_id, contact_id)
);

create index if not exists whatsapp_regra_envios_contato_idx
  on public.whatsapp_regra_envios (contact_id);

alter table public.whatsapp_regras_automaticas enable row level security;
alter table public.whatsapp_regra_envios enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='whatsapp_regras_automaticas'
                   and policyname='whatsapp_regras_leitura') then
    create policy whatsapp_regras_leitura on public.whatsapp_regras_automaticas
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename='whatsapp_regra_envios'
                   and policyname='whatsapp_envios_leitura') then
    create policy whatsapp_envios_leitura on public.whatsapp_regra_envios
      for select using (auth.uid() is not null);
  end if;
end $$;

commit;
