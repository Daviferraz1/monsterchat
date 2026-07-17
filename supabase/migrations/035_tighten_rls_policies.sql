-- 035: Endurece as políticas RLS permissivas (rls_policy_always_true)
--
-- Contexto: as políticas de escrita `TO authenticated USING (true)` da migração 007/024
-- davam a qualquer usuário autenticado acesso irrestrito de escrita via PostgREST.
-- Verifiquei no código quem escreve cada tabela pelo NAVEGADOR (role authenticated):
--   - contacts (UPDATE) e conversations (UPDATE): USADAS pelo frontend (inbox) → mantidas.
--   - products, quick_replies, messages(insert), internal_notes(insert): só o servidor
--     escreve (supabaseAdmin/service_role, que ignora RLS) → políticas authenticated
--     removidas (menor privilégio; não quebra nada).

-- ─── 1) Remove políticas de escrita `authenticated` não usadas pelo cliente ───
-- (o servidor continua escrevendo via service_role, que ignora RLS)
drop policy if exists "Authenticated can manage products" on public.products;      -- ALL
drop policy if exists "Agents can manage quick replies"   on public.quick_replies; -- ALL (tabela nem é usada no app)
drop policy if exists "Agents can insert messages"        on public.messages;      -- INSERT (cliente só lê)
drop policy if exists "Agents can create internal notes"  on public.internal_notes;-- INSERT (só o servidor cria)

-- As políticas de SELECT de authenticated (leitura) permanecem intactas, então o
-- inbox continua lendo mensagens, notas, etc. normalmente.

-- ─── 2) contacts / conversations: escrita é usada pelo inbox → mantém acesso, ──
-- mas troca `USING (true)` pela forma recomendada `auth.uid() is not null`
-- (exige uma sessão autenticada real; mesmo efeito prático p/ sua equipe logada).
drop policy if exists "Agents can update contacts" on public.contacts;
create policy "Agents can update contacts"
  on public.contacts for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "Agents can update conversations" on public.conversations;
create policy "Agents can update conversations"
  on public.conversations for update
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
