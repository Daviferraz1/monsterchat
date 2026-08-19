-- 040: Corrige o desempenho das policies de escopo criadas na 039.
--
-- Sintoma: com um operador de escopo restrito, qualquer leitura de conversations
-- ou messages estourava o statement timeout do Postgres (código 57014).
--
-- Causa: eu escrevi as chamadas de função direto no USING:
--     public.my_conversation_scope() = 'all' or ...
--   Funções STABLE não são dobradas em constante pelo planner — elas são avaliadas
--   UMA VEZ POR LINHA. E my_department_ids() faz duas subconsultas por chamada.
--   Em 7.611 conversas (e centenas de milhares de mensagens) isso é inviável.
--   Fica pior quando NENHUMA linha passa no filtro: o LIMIT nunca se satisfaz e o
--   Postgres varre a tabela inteira executando a função em cada linha.
--
-- Correção: envolver cada chamada em uma subconsulta escalar — `(select f())`.
--   Aí o planner a transforma em InitPlan, avalia uma única vez por consulta e o
--   predicado vira `assigned_to = <uuid>`, que usa idx_conversations_assigned.
--   É o padrão recomendado pelo próprio Supabase para RLS.
--
-- Detalhe de sintaxe: para o array de departamentos NÃO dá para escrever
--   `department_id = any ((select public.my_department_ids()))`
-- porque o Postgres lê o parêntese como subconsulta de LINHAS e tenta comparar
-- uuid com uuid[] (42883). A forma `in (select unnest(...))` evita isso e recebe
-- o mesmo tratamento de InitPlan.
--
-- messages, internal_notes e conversation_transfers não chamam as funções direto:
-- elas herdam a policy de conversations pelo EXISTS, então são corrigidas junto.

drop policy if exists "Conversas visíveis conforme escopo" on public.conversations;
create policy "Conversas visíveis conforme escopo"
  on public.conversations for select
  to authenticated
  using (
    (select public.my_conversation_scope()) = 'all'
    or assigned_to = (select auth.uid())
    or (
      (select public.my_conversation_scope()) = 'department'
      and (
        department_id is null
        or department_id in (select unnest(public.my_department_ids()))
      )
    )
  );

drop policy if exists "Conversas editáveis conforme escopo" on public.conversations;
create policy "Conversas editáveis conforme escopo"
  on public.conversations for update
  to authenticated
  using (
    (select public.my_conversation_scope()) = 'all'
    or assigned_to = (select auth.uid())
    or (
      (select public.my_conversation_scope()) = 'department'
      and (
        department_id is null
        or department_id in (select unnest(public.my_department_ids()))
      )
    )
  )
  with check (
    (select public.my_conversation_scope()) = 'all'
    or assigned_to = (select auth.uid())
    or (
      (select public.my_conversation_scope()) = 'department'
      and (
        department_id is null
        or department_id in (select unnest(public.my_department_ids()))
      )
    )
  );

-- Índice para o caso "só as atribuídas a mim": sem ele o filtro por dono ainda
-- varre a tabela quando o operador não tem nenhuma conversa.
create index if not exists idx_conversations_assigned_to
  on public.conversations(assigned_to)
  where assigned_to is not null;
