-- 039: Departamento na conversa, transferência entre operadores e RLS com escopo.
--
-- Depende da 038 (my_role / my_conversation_scope / my_department_ids).
--
-- Duas entregas:
--   1. A conversa passa a ter departamento + dono + histórico de transferência.
--   2. As policies `using (true)` de conversations/messages/internal_notes são
--      trocadas pelo escopo real do usuário.
--
-- Regra de visibilidade (escopo 'department'): vê o que é dele, o que é do(s)
-- departamento(s) dele, e o que AINDA NÃO FOI TRIADO (department_id null). Essa
-- última parte é o que impede a fila de sumir no dia do deploy — conversa nova
-- chega sem departamento e continua visível para todo mundo até alguém direcionar.

-- ─── 1) Conversa: departamento, dono e marcos de tempo ───────────────────────
alter table public.conversations
  add column if not exists department_id     uuid references public.sectors(id) on delete set null,
  add column if not exists assigned_at       timestamptz,
  add column if not exists assigned_by       uuid references auth.users(id) on delete set null,
  add column if not exists first_response_at timestamptz;

create index if not exists idx_conversations_department
  on public.conversations(department_id, status, last_message_at desc);

create index if not exists idx_conversations_unassigned
  on public.conversations(last_message_at desc)
  where assigned_to is null;

comment on column public.conversations.department_id is
  'Departamento responsável. NULL = ainda não triada (visível para todos os escopos department).';
comment on column public.conversations.first_response_at is
  'Primeira resposta de um atendente humano nesta conversa. Base do tempo de primeira resposta.';

-- Backfill: primeira mensagem outbound de atendente já existente.
update public.conversations c
set first_response_at = sub.first_at
from (
  select conversation_id, min(created_at) as first_at
    from public.messages
   where direction = 'outbound' and sender_type = 'agent'
   group by conversation_id
) sub
where sub.conversation_id = c.id
  and c.first_response_at is null;

-- ─── 2) Quem respondeu: sem isso não existe estatística por operador ─────────
-- sender_id é TEXT e nunca foi preenchido pelo app. Coluna tipada e indexada.
alter table public.messages
  add column if not exists agent_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_messages_agent_user
  on public.messages(agent_user_id, created_at desc)
  where agent_user_id is not null;

comment on column public.messages.agent_user_id is
  'Operador que enviou a mensagem (outbound/agent). NULL em inbound, bot e envios automáticos.';

-- Aproveita o pouco que houver em sender_id (se for um uuid válido).
update public.messages
set agent_user_id = sender_id::uuid
where agent_user_id is null
  and direction = 'outbound'
  and sender_type = 'agent'
  and sender_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and exists (select 1 from auth.users u where u.id = sender_id::uuid);

-- ─── 3) Histórico de transferência (auditoria do gestor) ─────────────────────
create table if not exists public.conversation_transfers (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  from_user_id    uuid references auth.users(id) on delete set null,
  to_user_id      uuid references auth.users(id) on delete set null,
  from_department uuid references public.sectors(id) on delete set null,
  to_department   uuid references public.sectors(id) on delete set null,
  transferred_by  uuid references auth.users(id) on delete set null,
  reason          text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_transfers_conversation
  on public.conversation_transfers(conversation_id, created_at desc);
create index if not exists idx_transfers_to_user
  on public.conversation_transfers(to_user_id, created_at desc);

-- ─── 4) RLS: troca `using (true)` pelo escopo real ───────────────────────────
-- As funções não recebem argumento por linha, então o planner as resolve uma vez
-- por consulta (InitPlan) em vez de por linha.

drop policy if exists "Agents can read all conversations" on public.conversations;
create policy "Conversas visíveis conforme escopo"
  on public.conversations for select
  to authenticated
  using (
    public.my_conversation_scope() = 'all'
    or assigned_to = auth.uid()
    or (
      public.my_conversation_scope() = 'department'
      and (department_id is null or department_id = any (public.my_department_ids()))
    )
  );

-- Escrita (finalizar conversa, zerar não lidas) segue o mesmo escopo.
drop policy if exists "Agents can update conversations" on public.conversations;
create policy "Conversas editáveis conforme escopo"
  on public.conversations for update
  to authenticated
  using (
    public.my_conversation_scope() = 'all'
    or assigned_to = auth.uid()
    or (
      public.my_conversation_scope() = 'department'
      and (department_id is null or department_id = any (public.my_department_ids()))
    )
  )
  with check (
    public.my_conversation_scope() = 'all'
    or assigned_to = auth.uid()
    or (
      public.my_conversation_scope() = 'department'
      and (department_id is null or department_id = any (public.my_department_ids()))
    )
  );

-- Mensagens e notas herdam o escopo via EXISTS: o subselect em conversations é
-- filtrado pela policy acima, então a regra fica em UM lugar só.
drop policy if exists "Agents can read all messages" on public.messages;
create policy "Mensagens seguem o escopo da conversa"
  on public.messages for select
  to authenticated
  using (
    exists (select 1 from public.conversations c where c.id = messages.conversation_id)
  );

drop policy if exists "Agents can read internal notes" on public.internal_notes;
create policy "Notas seguem o escopo da conversa"
  on public.internal_notes for select
  to authenticated
  using (
    exists (select 1 from public.conversations c where c.id = internal_notes.conversation_id)
  );

-- Nome/cor do departamento não é sensível e a UI precisa deles para badges e filtros.
alter table public.conversation_transfers enable row level security;
create policy "Transferências seguem o escopo da conversa"
  on public.conversation_transfers for select
  to authenticated
  using (
    exists (select 1 from public.conversations c where c.id = conversation_transfers.conversation_id)
  );

create policy "Departamentos são legíveis pela equipe"
  on public.sectors for select
  to authenticated
  using (true);

-- Realtime para o histórico aparecer sem refresh (conversations já está publicado).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'conversation_transfers'
  ) then
    alter publication supabase_realtime add table public.conversation_transfers;
  end if;
end $$;
