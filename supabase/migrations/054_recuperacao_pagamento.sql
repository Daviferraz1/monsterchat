-- Régua de recuperação de boleto e PIX não pagos.
--
-- Em 14 dias, 144 transações pararam em `abandoned`, `billet_printed` ou
-- `waiting_payment`: R$ 52 mil de gente que já escolheu o produto, gerou a
-- cobrança e não concluiu. Em 30 dias são R$ 130 mil. É o dinheiro mais barato
-- da casa — não precisa de anúncio, precisa de um lembrete.
--
-- POR QUE TEM QUE SER TEMPLATE: nenhum desses 144 contatos tinha falado no
-- WhatsApp nas últimas 24h. Fora dessa janela a Meta recusa texto livre, então
-- a primeira mensagem sai obrigatoriamente como template aprovado (categoria
-- UTILITY, que é justamente "lembrete de pagamento"). Quando a pessoa responde,
-- a janela abre e o atendimento segue normal, em texto livre.
--
-- Por isso `ativo` nasce FALSE: sem o template aprovado na Meta, cada envio
-- seria só um erro no log. Ligar é um passo consciente, depois da aprovação.

begin;

create table if not exists public.recuperacao_config (
  id               uuid primary key default gen_random_uuid(),
  ativo            boolean not null default false,
  -- Nome e idioma do template aprovado no Gerenciador da Meta.
  template_nome    text,
  template_idioma  text not null default 'pt_BR',
  -- Quando cada etapa dispara, em horas desde a cobrança. 20h faz a primeira
  -- cair no dia seguinte, ainda dentro do vencimento do boleto de 3 dias;
  -- 68h faz a segunda cair na véspera do vencimento.
  etapa1_horas     integer not null default 20,
  etapa2_horas     integer not null default 68,
  -- Ninguém recebe cobrança às 3 da manhã. Horário de Brasília.
  hora_inicio      integer not null default 9,
  hora_fim         integer not null default 20,
  -- Teto por execução: protege o número de um disparo em massa acidental.
  max_por_execucao integer not null default 40,
  -- Só olha cobranças recentes: lembrar de um boleto de 20 dias atrás é ruído.
  janela_dias      integer not null default 7,
  -- Produtos que não entram na régua (ex.: taxas, ajustes de cartão).
  produtos_ignorados text[] not null default '{}',
  updated_at       timestamptz not null default now()
);

comment on table public.recuperacao_config is
  'Configuração única da régua de recuperação. Uma linha só.';
comment on column public.recuperacao_config.ativo is
  'Só ligar depois que o template estiver aprovado na Meta — ver RECUPERACAO_PAGAMENTO.md.';

insert into public.recuperacao_config (ativo, template_nome)
select false, null
where not exists (select 1 from public.recuperacao_config);

-- Histórico de envio. A unique (transação, etapa) é o que garante que ninguém
-- recebe o mesmo lembrete duas vezes, mesmo se o cron rodar duas vezes junto.
create table if not exists public.recuperacao_envios (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  text not null,
  etapa           smallint not null check (etapa in (1, 2)),
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  status          text not null default 'sent' check (status in ('sent', 'failed')),
  produto         text,
  valor           numeric(12, 2),
  metodo          text,
  external_id     text,
  erro            text,
  created_at      timestamptz not null default now(),
  constraint recuperacao_envios_unico unique (transaction_id, etapa)
);

create index if not exists recuperacao_envios_contato_idx
  on public.recuperacao_envios (contact_id);
create index if not exists recuperacao_envios_data_idx
  on public.recuperacao_envios (created_at desc);

-- A régua varre guru_sales por data; sem isto a varredura é seq scan.
create index if not exists guru_sales_transaction_idx
  on public.guru_sales (transaction_id);

alter table public.recuperacao_config enable row level security;
alter table public.recuperacao_envios enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'recuperacao_config'
                   and policyname = 'recuperacao_config_leitura') then
    create policy recuperacao_config_leitura on public.recuperacao_config
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'recuperacao_config'
                   and policyname = 'recuperacao_config_escrita') then
    create policy recuperacao_config_escrita on public.recuperacao_config
      for update using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'recuperacao_envios'
                   and policyname = 'recuperacao_envios_leitura') then
    create policy recuperacao_envios_leitura on public.recuperacao_envios
      for select using (auth.uid() is not null);
  end if;
end $$;

commit;
