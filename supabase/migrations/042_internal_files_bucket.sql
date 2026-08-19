-- 042: Bucket próprio e PRIVADO para os anexos da conversa interna da equipe.
--
-- Por que não usar o `media`: aquele bucket é público (migração 014/036). Qualquer
-- um com a URL abre o arquivo — aceitável para a mídia que o próprio aluno mandou
-- no chat, inadmissível para um documento interno sobre a negociação dele.
--
-- Aqui o bucket nasce privado e SEM nenhuma policy em storage.objects: só o
-- service_role alcança. O navegador nunca recebe a URL do arquivo — ele pede
-- /api/internal-files, que confere o acesso à conversa e devolve uma URL assinada
-- de vida curta.

insert into storage.buckets (id, name, public)
values ('internas', 'internas', false)
on conflict (id) do nothing;

-- Caminho do objeto dentro do bucket `internas` (ex.: "<conversation_id>/169...-nota.pdf").
-- Fica separado de media_url de propósito: media_url guarda URL direta (bucket público),
-- media_path guarda referência a arquivo privado, que só sai por URL assinada.
alter table public.internal_notes
  add column if not exists media_path text;

comment on column public.internal_notes.media_path is
  'Objeto no bucket privado `internas`. Servido só via /api/internal-files (URL assinada).';
