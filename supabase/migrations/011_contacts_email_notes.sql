-- Campos opcionais para contatos: email e observações
alter table public.contacts
  add column if not exists email text,
  add column if not exists notes text;

-- Permite que agentes autenticados atualizem contatos (ex.: email, observações)
create policy "Agents can update contacts"
  on contacts for update
  to authenticated
  using (true)
  with check (true);
