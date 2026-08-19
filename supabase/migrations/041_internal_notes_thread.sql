-- 041: Conversa interna da equipe dentro do card, com anexo.
--
-- Reaproveita internal_notes (migração 006) em vez de criar tabela nova: já é
-- "recado da equipe preso a uma conversa", que é exatamente o que o quadro precisa.
--
-- Duas mudanças:
--   1. author_id deixa de ser NOT NULL. Além de permitir nota do sistema/IA, isso
--      conserta um bug em silêncio: apps/web/src/lib/api/ia/agent.ts insere
--      `author_id: null` ao marcar um LEAD e o retorno de erro nunca é conferido —
--      ou seja, essa nota nunca foi gravada.
--   2. Campos de anexo, no mesmo formato que messages usa (url + mime + nome + tamanho).

alter table public.internal_notes
  alter column author_id drop not null;

alter table public.internal_notes
  add column if not exists media_url       text,
  add column if not exists media_mime_type text,
  add column if not exists media_filename  text,
  add column if not exists media_size      integer;

comment on column public.internal_notes.author_id is
  'Operador que escreveu. NULL = nota gerada pelo sistema/IA.';
comment on column public.internal_notes.media_url is
  'Anexo no bucket media, sob o prefixo internas/. Ver aviso de privacidade abaixo.';

-- ATENÇÃO (dívida consciente): o bucket `media` é público. Um anexo interno fica
-- acessível a quem tiver a URL, ainda que a listagem esteja bloqueada (migração 036).
-- Por isso os arquivos internos vão para o prefixo `internas/`: quando o bucket for
-- fechado e passar a usar URL assinada, dá para tratar esse prefixo primeiro.

-- Leitura já foi escopada na 039 (herda a policy de conversations pelo EXISTS).
-- A escrita continua só pelo servidor (service_role), para o autor sair da SESSÃO
-- e não do corpo da requisição — mesma decisão que foi tomada em messages.

-- Thread ao vivo: os dois operadores veem a resposta sem recarregar.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'internal_notes'
  ) then
    alter publication supabase_realtime add table public.internal_notes;
  end if;
end $$;

-- Realtime só entrega a linha inteira no UPDATE/DELETE com replica identity full;
-- para INSERT (o caso da thread) o default já basta, mas deixamos explícito.
alter table public.internal_notes replica identity full;
