-- Fase 3 (enxuta): memória de conversa — resumo rolante + slots estruturados.
-- Guardados na própria conversation_analysis (uma linha por conversa).

alter table conversation_analysis
  add column if not exists summary text,
  add column if not exists slots jsonb default '{}'::jsonb,
  add column if not exists summary_message_count integer default 0;
