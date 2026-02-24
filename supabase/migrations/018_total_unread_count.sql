-- Função para obter o número de conversas com mensagens não lidas (unread_count > 0)
-- Usado no badge do rail (desktop e mobile)
create or replace function public.get_total_unread_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.conversations where unread_count > 0;
$$;

comment on function public.get_total_unread_count() is 'Retorna a quantidade de conversas com mensagens não lidas (unread_count > 0) para o badge do inbox';

-- Permite que usuários autenticados chamem a função
grant execute on function public.get_total_unread_count() to authenticated;
grant execute on function public.get_total_unread_count() to anon;
