-- Garante que o Realtime envie a linha completa em INSERT/UPDATE (payload.new/old)
-- Necessário para postgres_changes entregar o conteúdo das mensagens ao frontend
alter table public.messages replica identity full;
