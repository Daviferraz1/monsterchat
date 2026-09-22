-- Boas-vindas por WhatsApp: "acesso liberado" e "pedido recebido".
--
-- A maior reclamação dos alunos no chat é não conseguir entrar na plataforma
-- (14% dos atendimentos de alunos em 90 dias; 5,3% das compras viram um chamado
-- de acesso em até 7 dias). Em 88 de 99 casos com e-mail informado a conta JÁ
-- existia: a pessoa não sabia qual e-mail usou, não achou o e-mail de
-- boas-vindas ou não lembrava a senha. O acesso era comunicado uma única vez,
-- só por e-mail, e só quando a Guru mandava `approved`.
--
-- Aqui o MonsterChat passa a avisar pelo WhatsApp, que é onde o aluno está:
--
--   acesso  — ao virar `approved`: matrícula ativa, qual e-mail usar, onde
--             entrar e o que fazer se não lembrar a senha.
--   pedido  — ao gerar boleto: recebemos o pedido, o acesso sai sozinho quando
--             compensar, e o link da 2ª via. PIX não entra (compensa em minutos).
--
-- Sai por template UTILITY aprovado, como a régua de recuperação: fora da
-- janela de 24h a Meta recusa texto livre (#131047). `ativo` nasce FALSE.
begin;

create table if not exists public.boas_vindas_config (
  id               uuid primary key default gen_random_uuid(),
  ativo            boolean not null default false,
  -- Templates aprovados no Gerenciador da Meta. Nulo = não manda aquele tipo.
  template_acesso  text default 'acesso_liberado',
  template_pedido  text default 'pedido_recebido',
  template_idioma  text not null default 'pt_BR',
  -- Base do botão de URL dinâmica do `pedido` (2ª via). O sufixo é o transaction_id.
  link_base        text not null default 'https://pagamento.monsterconcursos.com.br/invoice/',
  -- Horário de Brasília. Fora dele o cron da hora seguinte manda.
  hora_inicio      integer not null default 8,
  hora_fim         integer not null default 22,
  max_por_execucao integer not null default 40,
  -- Só avisa transações recentes: boas-vindas de uma compra de 10 dias é ruído.
  janela_dias      integer not null default 3,
  -- Para saber se a pessoa já era aluna do produto (renovação, recompra).
  historico_dias   integer not null default 365,
  -- Produtos que NÃO entram. Os da Fagenius (Tecnólogo, Sequencial, Direito)
  -- têm matrícula pela secretaria e outra plataforma (tec.fagenius.com.br):
  -- mandar "entre no Monster Study" para eles seria errado. "Alteração" e
  -- "Taxa" são lançamentos manuais da secretaria, não matrícula.
  produtos_ignorados text[] not null default '{"Tecnologo","Tecnólogo","Sequencial","Direito","Alteração","Taxa"}',
  -- Só transações gravadas a partir daqui recebem mensagem. Definir ao ligar:
  -- na simulação de 22/09/2026 havia 77 compras de 1 a 3 dias na fila, e um
  -- "acesso liberado" chegando dois dias depois da compra leria como erro.
  iniciado_em      timestamptz,
  updated_at       timestamptz not null default now()
);

comment on table public.boas_vindas_config is
  'Configuração única das boas-vindas por WhatsApp. Uma linha só.';
comment on column public.boas_vindas_config.ativo is
  'Só ligar depois dos templates aprovados na Meta — ver BOAS_VINDAS.md.';

insert into public.boas_vindas_config (ativo)
select false
where not exists (select 1 from public.boas_vindas_config);

-- Histórico. A unique (transação, tipo) garante uma mensagem por transação,
-- mesmo com webhook e cron rodando ao mesmo tempo.
create table if not exists public.boas_vindas_envios (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  text not null,
  tipo            text not null check (tipo in ('acesso', 'pedido')),
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  status          text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  motivo          text,
  produto         text,
  email           text,
  metodo          text,
  external_id     text,
  erro            text,
  created_at      timestamptz not null default now(),
  constraint boas_vindas_envios_unico unique (transaction_id, tipo)
);

comment on column public.boas_vindas_envios.motivo is
  'Por que foi pulado: ja_era_aluno, parcela_de_assinatura, sem_template, produto_ignorado.';

create index if not exists boas_vindas_envios_contato_idx
  on public.boas_vindas_envios (contact_id);
create index if not exists boas_vindas_envios_status_idx
  on public.boas_vindas_envios (status, created_at desc);

alter table public.boas_vindas_config enable row level security;
alter table public.boas_vindas_envios enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'boas_vindas_config'
                   and policyname = 'boas_vindas_config_leitura') then
    create policy boas_vindas_config_leitura on public.boas_vindas_config
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'boas_vindas_config'
                   and policyname = 'boas_vindas_config_escrita') then
    create policy boas_vindas_config_escrita on public.boas_vindas_config
      for update using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'boas_vindas_envios'
                   and policyname = 'boas_vindas_envios_leitura') then
    create policy boas_vindas_envios_leitura on public.boas_vindas_envios
      for select using (auth.uid() is not null);
  end if;
end $$;

commit;
