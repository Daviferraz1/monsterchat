-- Habilitar Row Level Security
alter table channels enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table quick_replies enable row level security;
alter table internal_notes enable row level security;

-- Políticas para canais (apenas autenticados podem ler)
create policy "Agents can read all channels"
  on channels for select
  to authenticated
  using (true);

-- Políticas para contatos (apenas autenticados podem ler)
create policy "Agents can read all contacts"
  on contacts for select
  to authenticated
  using (true);

-- Políticas para conversas (autenticados podem ler tudo)
create policy "Agents can read all conversations"
  on conversations for select
  to authenticated
  using (true);

create policy "Agents can update conversations"
  on conversations for update
  to authenticated
  using (true);

-- Políticas para mensagens (autenticados podem ler tudo)
create policy "Agents can read all messages"
  on messages for select
  to authenticated
  using (true);

create policy "Agents can insert messages"
  on messages for insert
  to authenticated
  with check (true);

-- Apenas service_role pode inserir via webhook (será feito pelo backend)
-- As mensagens inseridas via webhook não precisam de política RLS pois
-- o backend usa service_role key

-- Políticas para quick replies
create policy "Agents can read quick replies"
  on quick_replies for select
  to authenticated
  using (true);

create policy "Agents can manage quick replies"
  on quick_replies for all
  to authenticated
  using (true)
  with check (true);

-- Políticas para notas internas
create policy "Agents can read internal notes"
  on internal_notes for select
  to authenticated
  using (true);

create policy "Agents can create internal notes"
  on internal_notes for insert
  to authenticated
  with check (true);
