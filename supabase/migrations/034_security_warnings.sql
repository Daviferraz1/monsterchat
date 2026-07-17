-- 034: Avisos (WARN) do Supabase Database Linter — MonsterChat
--
-- Corrige aqui só o que é seguro por SQL sem quebrar o app. Os itens que dependem
-- de configuração no painel (cadastro público, senha vazada, bucket público) e os
-- que exigem decisão estão documentados no fim deste arquivo.

-- ─── 1) search_path fixo nas funções (function_search_path_mutable) ───────────
-- Sem search_path fixo, uma função pode resolver objetos por um schema injetado.
-- Fixamos em public (onde ficam knowledge_base e a extensão vector).
alter function public.search_knowledge_base(text, text, integer) set search_path = public;
alter function public.match_knowledge_base(vector, text, integer, double precision) set search_path = public;

-- ─── 2) get_total_unread_count: não deve rodar como SECURITY DEFINER p/ anon ──
-- (anon_/authenticated_security_definer_function_executable)
-- Passa a SECURITY INVOKER: roda com o RLS de quem chama. Equipe (authenticated)
-- lê tudo (política "Agents can read all conversations"); anon não tem política de
-- leitura em conversations → retorna 0. Ainda revogamos execução do anon.
create or replace function public.get_total_unread_count()
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::bigint from public.conversations where unread_count > 0;
$$;

revoke execute on function public.get_total_unread_count() from anon, public;
grant execute on function public.get_total_unread_count() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- NÃO automatizado aqui (precisa de decisão/painel):
--
-- • rls_policy_always_true (contacts/conversations/messages/products/quick_replies/
--   internal_notes): políticas USING/WITH CHECK (true) para `authenticated`.
--   O frontend USA as de contacts e conversations (update direto). Como todo
--   `authenticated` é tratado como equipe, o controle correto é FECHAR O CADASTRO
--   PÚBLICO no painel (Authentication → Sign In/Providers → desativar signups).
--   Assim `authenticated` = só quem você convida, e as políticas deixam de ser
--   exploráveis por terceiros. (Não há coluna de "staff" para escrever política
--   mais restrita sem reescrever o modelo de auth.)
--
-- • auth_leaked_password_protection: ativar em Authentication → Policies
--   ("Leaked password protection" / HaveIBeenPwned). É um toggle.
--
-- • public_bucket_allows_listing (bucket `media`): a política "Public read media"
--   permite LISTAR todos os arquivos (fotos/áudios/docs dos chats). Para corrigir:
--   1) marque o bucket `media` como Public no painel (Storage → media → Make public);
--   2) então troque a política para permitir só acesso ao objeto por URL, não a
--      listagem. NÃO fiz por migração porque, se o bucket não estiver marcado como
--      público, remover a política deixa as URLs de mídia com 401 (quebra o chat).
--
-- • extension_in_public (vector no schema public): mover a extensão depois que
--   colunas do tipo `vector` já existem é arriscado (pode quebrar embeddings).
--   Baixa severidade — recomendo deixar como está.
