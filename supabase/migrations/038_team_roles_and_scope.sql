-- 038: Níveis de usuário, departamentos e escopo de visibilidade das conversas.
--
-- Problema que resolve:
--   Hoje qualquer usuário logado lê TODAS as conversas. As policies da 007/035 são
--   `to authenticated using (true)` — e o navegador fala direto com o PostgREST usando
--   a anon key. Ou seja: esconder conversa na tela não esconde de verdade. Escopo por
--   departamento só é real se estiver na RLS.
--
-- Modelo (2 eixos, de propósito):
--   role               → o que a pessoa pode CONFIGURAR (admin/gestor/supervisor/atendente)
--   conversation_scope → o que a pessoa pode VER        (all/department/assigned)
--   Assim dá pra ter "operador que vê tudo" sem inventar cargo novo, e "gestor" que vê
--   tudo por definição do cargo.
--
-- Segurança na virada: quem AINDA NÃO estiver cadastrado em team_members continua
-- enxergando tudo (fallback 'all'). O aperto só vale para quem foi cadastrado — o
-- deploy não trava o atendimento de ninguém.

-- ─── 1) Setores viram departamentos de atendimento ───────────────────────────
alter table public.sectors
  add column if not exists color text not null default '#8b5cf6',
  add column if not exists sla_first_response_minutes integer,
  add column if not exists sla_resolution_minutes integer,
  add column if not exists sort_order integer not null default 100;

comment on column public.sectors.sla_first_response_minutes is
  'SLA de primeira resposta em minutos (fase C/D). NULL = sem SLA definido.';

insert into public.sectors (name, description, sort_order) values
  ('Comercial e Suporte', 'Matrículas, dúvidas de curso e suporte ao aluno na plataforma', 10),
  ('Financeiro',          'Negociação de pendências, 2ª via, reembolso e cobrança',        20),
  ('Secretaria',          'Documentação, declarações e certificados',                      30),
  ('Pedagógico',          'Dúvidas de conteúdo, edital e orientação de estudo',            40),
  ('TI',                  'Sistemas internos, integrações e infraestrutura',               50)
on conflict (name) do nothing;

-- ─── 2) Equipe: escopo de visibilidade + vínculo com login ───────────────────
alter table public.team_members
  add column if not exists email text,
  add column if not exists conversation_scope text not null default 'department';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'team_members_conversation_scope_check'
  ) then
    alter table public.team_members
      add constraint team_members_conversation_scope_check
      check (conversation_scope in ('all', 'department', 'assigned'));
  end if;
end $$;

comment on column public.team_members.conversation_scope is
  'all = vê todas as conversas | department = vê as do(s) seu(s) departamento(s) + as não triadas | assigned = só as atribuídas a ele.';
comment on column public.team_members.role is
  'Permissão de configuração. admin/gestor enxergam tudo independente de conversation_scope.';

-- Um colaborador pode atuar em mais de um departamento (equipe pequena cobre duas
-- filas na baixa temporada e só matrículas quando sai edital). sector_id continua
-- valendo como "departamento principal" (usado pelo módulo de ponto).
create table if not exists public.team_member_departments (
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  department_id  uuid not null references public.sectors(id)      on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (team_member_id, department_id)
);

create index if not exists idx_tmd_department on public.team_member_departments(department_id);

-- Quem já tem setor principal entra também na tabela N:N (fonte única para o escopo).
insert into public.team_member_departments (team_member_id, department_id)
select id, sector_id from public.team_members where sector_id is not null
on conflict do nothing;

alter table public.team_member_departments enable row level security; -- só service_role

-- ─── 3) Funções de contexto (SECURITY DEFINER: team_members é service_role-only) ──
-- São STABLE e sem argumento variável por linha, então o planner avalia UMA vez por
-- consulta (InitPlan) — não vira função por linha dentro da policy.

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select tm.role from public.team_members tm where tm.user_id = auth.uid() and tm.active limit 1),
    -- Bootstrap: enquanto NINGUÉM estiver cadastrado, quem logar é admin (senão não
    -- haveria como cadastrar o primeiro). Depois disso, não-cadastrado é atendente.
    case when exists (select 1 from public.team_members where active) then 'atendente' else 'admin' end
  );
$$;

create or replace function public.my_conversation_scope()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.my_role() in ('admin', 'gestor') then 'all'
    else coalesce(
      (select tm.conversation_scope from public.team_members tm
        where tm.user_id = auth.uid() and tm.active limit 1),
      'all' -- não cadastrado na equipe: não perde acesso (não trava a operação)
    )
  end;
$$;

create or replace function public.my_department_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct dep), '{}'::uuid[])
  from (
    select tm.sector_id as dep
      from public.team_members tm
     where tm.user_id = auth.uid() and tm.active and tm.sector_id is not null
    union
    select tmd.department_id
      from public.team_member_departments tmd
      join public.team_members tm on tm.id = tmd.team_member_id
     where tm.user_id = auth.uid() and tm.active
  ) s
  where dep is not null;
$$;

grant execute on function public.my_role()               to authenticated;
grant execute on function public.my_conversation_scope() to authenticated;
grant execute on function public.my_department_ids()     to authenticated;

comment on function public.my_conversation_scope() is
  'Escopo efetivo do usuário logado. admin/gestor = all. Sem cadastro em team_members = all (fallback de rollout).';
