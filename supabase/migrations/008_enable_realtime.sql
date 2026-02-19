-- Habilitar Realtime para tabelas específicas
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table internal_notes;
