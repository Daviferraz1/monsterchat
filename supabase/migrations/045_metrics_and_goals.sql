-- 045_metrics_and_goals.sql
-- Painel de desempenho: motor de cálculo das métricas + metas por pessoa.
--
-- Por que em SQL e não no Node: parear "pergunta do aluno -> resposta do
-- atendente" em 78 mil mensagens exigiria trazer tudo para a aplicação. Aqui o
-- Postgres devolve só o agregado (alguns KB de JSON).
--
-- Depende de: 038 (papéis/escopo), 039 (department_id, agent_user_id), 043 (tasks).

-- ---------------------------------------------------------------------------
-- 1) Metas por pessoa
-- ---------------------------------------------------------------------------
create table if not exists public.team_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Métricas onde MAIOR é melhor e onde MENOR é melhor convivem na mesma tabela;
  -- quem sabe a direção é a aplicação (lib/metrics.ts), não o banco.
  metric text not null check (metric in (
    'conversations_handled',
    'answers_sent',
    'first_response_p50',
    'reply_rate',
    'tasks_completed',
    'tasks_on_time_rate',
    'task_resolution_p50'
  )),
  period text not null default 'monthly' check (period in ('daily', 'weekly', 'monthly')),
  target numeric not null check (target >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_goals_unique
  on public.team_goals (user_id, metric, period) where active;
create index if not exists idx_team_goals_user on public.team_goals (user_id) where active;

alter table public.team_goals enable row level security;

drop policy if exists "team_goals read" on public.team_goals;
create policy "team_goals read" on public.team_goals
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.my_role()) in ('admin', 'gestor'));

drop policy if exists "team_goals write" on public.team_goals;
create policy "team_goals write" on public.team_goals
  for all to authenticated
  using ((select public.my_role()) in ('admin', 'gestor'))
  with check ((select public.my_role()) in ('admin', 'gestor'));

-- ---------------------------------------------------------------------------
-- 2) Rodadas de atendimento
-- ---------------------------------------------------------------------------
-- Uma "rodada" é: o aluno escreve (uma ou várias mensagens seguidas) e a equipe
-- responde. É a unidade certa para medir espera — contar mensagem inflaria o
-- número, porque aluno que manda cinco mensagens seguidas não esperou cinco vezes.
--
-- Rodada sem resposta = a pergunta ficou no vácuo. É o dado mais importante aqui.
create or replace function public.metrics_rounds(
  p_from timestamptz,
  p_to timestamptz,
  p_scope text default 'all',
  p_user uuid default null,
  p_departments uuid[] default '{}'::uuid[]
)
returns table (
  conversation_id uuid,
  department_id uuid,
  agent_user_id uuid,
  asked_at timestamptz,
  answered_at timestamptz,
  wait_seconds double precision
)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with visivel as (
    select c.id, c.department_id
    from public.conversations c
    where p_scope = 'all'
       or c.assigned_to = p_user
       or (p_scope = 'department'
           and (c.department_id is null or c.department_id = any (p_departments)))
  ),
  msg as (
    select m.conversation_id,
           m.created_at,
           m.agent_user_id,
           case when m.direction = 'inbound' then 'in' else 'out' end as lado
    from public.messages m
    join visivel v on v.id = m.conversation_id
    -- Folga de 3 dias para trás: uma rodada pode ter começado antes da janela.
    -- O filtro final descarta as que não pertencem ao período.
    where m.created_at >= p_from - interval '3 days'
      and m.created_at < p_to
      and (m.direction = 'inbound' or m.sender_type = 'agent')
  ),
  marcado as (
    select msg.*,
           case
             when lado = 'in'
              and lag(lado) over (partition by conversation_id order by created_at)
                  is distinct from 'in'
             then 1 else 0
           end as abre_rodada
    from msg
  ),
  numerado as (
    select marcado.*,
           sum(abre_rodada) over (
             partition by conversation_id order by created_at
             rows between unbounded preceding and current row
           ) as rodada
    from marcado
  ),
  pareado as (
    select n.conversation_id,
           n.rodada,
           min(n.created_at) filter (where lado = 'in')  as asked_at,
           min(n.created_at) filter (where lado = 'out') as answered_at,
           (array_agg(n.agent_user_id order by n.created_at)
              filter (where lado = 'out' and n.agent_user_id is not null))[1] as agent_user_id
    from numerado n
    where n.rodada > 0  -- rodada 0 = saída da equipe sem pergunta antes (disparo ativo)
    group by n.conversation_id, n.rodada
  )
  select p.conversation_id,
         v.department_id,
         p.agent_user_id,
         p.asked_at,
         p.answered_at,
         case
           when p.answered_at is not null
           then extract(epoch from (p.answered_at - p.asked_at))::double precision
         end
  from pareado p
  join visivel v on v.id = p.conversation_id
  where p.asked_at >= p_from and p.asked_at < p_to;
$fn$;

-- ---------------------------------------------------------------------------
-- 3) Agregado pronto para o painel
-- ---------------------------------------------------------------------------
-- Devolve tudo numa chamada só. Percentis em vez de média: numa amostra real a
-- média deu 53 min contra 4 min de mediana — três conversas esquecidas puxam a
-- média inteira. A mediana descreve o dia normal; o p90 descreve o quão ruim
-- fica a cauda, que é onde o aluno desiste.
create or replace function public.metrics_conversations(
  p_from timestamptz,
  p_to timestamptz,
  p_scope text default 'all',
  p_user uuid default null,
  p_departments uuid[] default '{}'::uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with r as (
    select * from public.metrics_rounds(p_from, p_to, p_scope, p_user, p_departments)
  ),
  -- Fuso fixo: o painel é lido por gente em São Paulo. Em UTC o mapa de calor
  -- ficaria 3 horas deslocado e a leitura "onde falta gente" sairia errada.
  base as (
    select r.*, (r.asked_at at time zone 'America/Sao_Paulo') as asked_local
    from r
  ),
  por_dia as (
    select asked_local::date as dia,
           count(*)::int as rodadas,
           count(answered_at)::int as respondidas,
           percentile_cont(0.5) within group (order by wait_seconds) as p50,
           percentile_cont(0.9) within group (order by wait_seconds) as p90
    from base group by 1
  ),
  por_pessoa as (
    select agent_user_id,
           count(*)::int as respostas,
           count(distinct conversation_id)::int as conversas,
           percentile_cont(0.5) within group (order by wait_seconds) as p50,
           percentile_cont(0.9) within group (order by wait_seconds) as p90
    from base where answered_at is not null group by 1
  ),
  mapa as (
    select extract(dow  from asked_local)::int as dia_semana,
           extract(hour from asked_local)::int as hora,
           count(*)::int as perguntas,
           count(answered_at)::int as respondidas,
           percentile_cont(0.5) within group (order by wait_seconds) as p50
    from base group by 1, 2
  ),
  por_depto as (
    select department_id,
           count(*)::int as rodadas,
           count(answered_at)::int as respondidas,
           percentile_cont(0.5) within group (order by wait_seconds) as p50
    from base group by 1
  )
  select jsonb_build_object(
    'rodadas',       (select count(*) from base),
    'respondidas',   (select count(answered_at) from base),
    'conversas',     (select count(distinct conversation_id) from base),
    'p50',           (select percentile_cont(0.5) within group (order by wait_seconds) from base),
    'p90',           (select percentile_cont(0.9) within group (order by wait_seconds) from base),
    'diario',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.dia), '[]'::jsonb) from por_dia x),
    'pessoas',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from por_pessoa x),
    'mapa',          (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from mapa x),
    'departamentos', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from por_depto x)
  );
$fn$;

revoke all on function public.metrics_rounds(timestamptz, timestamptz, text, uuid, uuid[]) from public, anon;
revoke all on function public.metrics_conversations(timestamptz, timestamptz, text, uuid, uuid[]) from public, anon;
grant execute on function public.metrics_rounds(timestamptz, timestamptz, text, uuid, uuid[]) to service_role;
grant execute on function public.metrics_conversations(timestamptz, timestamptz, text, uuid, uuid[]) to service_role;

-- Índice que sustenta o pareamento (ordena mensagem dentro da conversa).
create index if not exists idx_messages_conversation_created
  on public.messages (conversation_id, created_at);
