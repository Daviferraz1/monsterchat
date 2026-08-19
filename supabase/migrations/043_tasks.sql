-- 043: Tarefas internas — trabalho da equipe que não nasce de um atendimento.
--
-- Decisão de modelo: tarefa é uma entidade SEPARADA da conversa, com vínculo
-- OPCIONAL a ela e ao aluno. Não é "conversa com outro tipo".
--
--   Por que não fundir com conversations: o ciclo de vida é dirigido por gente
--   diferente. A conversa reabre sozinha quando o aluno manda mensagem; a tarefa só
--   fecha quando a equipe fecha. Fundir criaria a pergunta sem resposta boa de
--   "quem encerra a tarefa quando o aluno responde".
--
--   Por que mesmo vocabulário de status e prioridade: as duas aparecem no MESMO
--   quadro, nas mesmas raias. Um gestor precisa de um lugar só para ver o que cada
--   pessoa está tocando agora — dois quadros recriam a demanda solta que isso
--   veio resolver.

-- ─── 1) Tipos de tarefa (configuráveis em tela, não enum no código) ──────────
create table if not exists public.task_types (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,
  description           text,
  default_department_id uuid references public.sectors(id) on delete set null,
  color                 text not null default '#8b5cf6',
  sort_order            integer not null default 100,
  active                boolean not null default true,
  created_at            timestamptz not null default now()
);

insert into public.task_types (name, description, sort_order) values
  ('Financeiro',            'Pagamento, boleto, reembolso, negociação',              10),
  ('Compras e orçamento',   'Cotação, orçamento, renovação de contrato/assinatura',  20),
  ('Projeto / TI',          'Andamento de projeto, sistema, integração, infra',      30),
  ('Secretaria e pedagógico','Documentação, certificado, conferência de material',   40)
on conflict (name) do nothing;

-- ─── 2) Tarefas ──────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  task_type_id    uuid references public.task_types(id) on delete set null,
  department_id   uuid references public.sectors(id) on delete set null,

  created_by      uuid references auth.users(id) on delete set null,
  assigned_to     uuid references auth.users(id) on delete set null,
  assigned_at     timestamptz,
  assigned_by     uuid references auth.users(id) on delete set null,

  -- Vínculos opcionais: de quem é a demanda e de onde ela veio.
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,

  -- Mesmo vocabulário das conversas: as raias do quadro são compartilhadas.
  status          text not null default 'open'
                    check (status in ('open', 'pending', 'snoozed', 'closed')),
  priority        text not null default 'normal'
                    check (priority in ('low', 'normal', 'high', 'urgent')),

  due_at          timestamptz,          -- o que conversa não tem: prazo
  first_seen_at   timestamptz,          -- quando o responsável abriu pela 1ª vez
  started_at      timestamptz,          -- quando saiu de "A fazer"
  completed_at    timestamptz,
  completed_by    uuid references auth.users(id) on delete set null,

  recurrence_id   uuid,                 -- FK adicionada depois da tabela de regras
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tasks_assigned    on public.tasks(assigned_to, status);
create index if not exists idx_tasks_department  on public.tasks(department_id, status);
create index if not exists idx_tasks_due         on public.tasks(due_at) where status <> 'closed';
create index if not exists idx_tasks_open        on public.tasks(status, priority, created_at desc);
create index if not exists idx_tasks_contact     on public.tasks(contact_id) where contact_id is not null;

comment on column public.tasks.contact_id is
  'Aluno que originou a demanda. É o que permite responder sabendo exatamente a quem.';
comment on column public.tasks.due_at is
  'Prazo. Atraso = due_at no passado com status <> closed.';

-- ─── 3) Recorrência ──────────────────────────────────────────────────────────
-- Regra que gera tarefas sozinha. Sem isso alguém recria "pagar o servidor"
-- doze vezes por ano na mão — e esquece em algum mês.
create table if not exists public.task_recurrences (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  task_type_id      uuid references public.task_types(id) on delete set null,
  department_id     uuid references public.sectors(id) on delete set null,
  assigned_to       uuid references auth.users(id) on delete set null,
  priority          text not null default 'normal'
                      check (priority in ('low', 'normal', 'high', 'urgent')),

  frequency         text not null check (frequency in ('daily', 'weekly', 'monthly')),
  interval_count    integer not null default 1 check (interval_count between 1 and 12),
  day_of_week       smallint check (day_of_week between 0 and 6),   -- weekly (0 = domingo)
  day_of_month      smallint check (day_of_month between 1 and 31), -- monthly
  -- Quantos dias ANTES do vencimento a tarefa aparece no quadro. Um boleto do dia 10
  -- que só surge no dia 10 já nasce em cima da hora.
  lead_days         integer not null default 3 check (lead_days between 0 and 60),

  next_due_at       timestamptz not null,
  last_created_at   timestamptz,
  active            boolean not null default true,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_recurrences_due on public.task_recurrences(next_due_at) where active;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_recurrence_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_recurrence_id_fkey
      foreign key (recurrence_id) references public.task_recurrences(id) on delete set null;
  end if;
end $$;

-- Não deixa a mesma ocorrência ser criada duas vezes se o cron rodar repetido.
create unique index if not exists idx_tasks_recurrence_occurrence
  on public.tasks(recurrence_id, due_at)
  where recurrence_id is not null;

-- ─── 4) Thread interna passa a servir tarefa também ──────────────────────────
-- Generaliza em vez de criar uma segunda tabela de comentários: recado e anexo
-- se comportam igual nos dois casos, com o mesmo código e a mesma regra de acesso.
alter table public.internal_notes
  alter column conversation_id drop not null;

alter table public.internal_notes
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;

create index if not exists idx_internal_notes_task
  on public.internal_notes(task_id, created_at desc) where task_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'internal_notes_alvo_unico'
  ) then
    alter table public.internal_notes
      add constraint internal_notes_alvo_unico
      check (num_nonnulls(conversation_id, task_id) = 1);
  end if;
end $$;

-- ─── 5) RLS ──────────────────────────────────────────────────────────────────
-- Mesmo escopo das conversas (funções da 038, no formato InitPlan da 040).
-- Diferença: quem CRIOU a tarefa sempre a enxerga, mesmo que ela vá para outro
-- departamento — senão você abre uma solicitação e perde ela de vista.
alter table public.tasks             enable row level security;
alter table public.task_types        enable row level security;
alter table public.task_recurrences  enable row level security;

create policy "Tarefas visíveis conforme escopo"
  on public.tasks for select
  to authenticated
  using (
    (select public.my_conversation_scope()) = 'all'
    or assigned_to = (select auth.uid())
    or created_by = (select auth.uid())
    or (
      (select public.my_conversation_scope()) = 'department'
      and (
        department_id is null
        or department_id in (select unnest(public.my_department_ids()))
      )
    )
  );

-- Escrita passa pelo servidor (service_role), para o autor sair da sessão.
-- task_types e task_recurrences ficam sem policy: leitura via rota de servidor.

create policy "Tipos de tarefa legíveis pela equipe"
  on public.task_types for select
  to authenticated
  using (true);

-- Notas: agora seguem o escopo da CONVERSA ou da TAREFA, conforme o alvo.
drop policy if exists "Notas seguem o escopo da conversa" on public.internal_notes;
create policy "Notas seguem o escopo do item"
  on public.internal_notes for select
  to authenticated
  using (
    (
      conversation_id is not null
      and exists (select 1 from public.conversations c where c.id = internal_notes.conversation_id)
    )
    or (
      task_id is not null
      and exists (select 1 from public.tasks t where t.id = internal_notes.task_id)
    )
  );

-- ─── 6) Realtime ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
