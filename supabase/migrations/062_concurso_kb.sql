-- 062: Base de concursos para a IA (ferramenta buscar_concurso)
--
-- A IA respondia "não tenho acesso ao edital" para dúvidas que a casa já tinha
-- documentadas: posts do blog, editais curados com PDF e fichas extraídas do
-- edital pelo concurso-monitor. Tudo isso mora no Supabase da plataforma ou no
-- SQLite local do monitor; aqui fica uma cópia pensada para busca, com uma
-- linha por documento (ou por trecho de PDF).
--
-- fonte:
--   blog   → blog_posts não arquivados (situação, autorização, datas)
--   edital → "Edital" + "Concurso" da plataforma (banca, cargos, datas, PDFs)
--   ficha  → JSON extraído do PDF pelo pipeline do monitor (cotas, requisitos, TAF…)
--   trecho → pedaço do texto do PDF, com a página, para o que a ficha não cobre
--
-- Só o service role lê e escreve (RLS ligado, sem policy), como knowledge_base.

create extension if not exists vector;

create table if not exists public.concurso_kb (
  id            bigserial primary key,
  fonte         text not null check (fonte in ('blog', 'edital', 'ficha', 'trecho')),
  ref           text not null,             -- chave na origem (slug do post, id do edital, id#n do trecho)
  titulo        text not null,
  orgao         text,
  uf            text,
  cargo         text,
  situacao      text,                      -- previsto, edital_publicado, inscricoes_abertas…
  edicao        text check (edicao in ('atual', 'anterior')),  -- ficha/trecho de edital da edição passada
  data_prova    date,
  inscricao_ate date,
  url           text,                      -- link público (post do blog ou PDF)
  pagina        int,                       -- trecho: página inicial no PDF
  texto         text not null,             -- o que a IA lê e o que é indexado
  dados         jsonb,                     -- ficha completa / metadados da origem
  hash          text,                      -- muda quando o texto muda → refaz o embedding
  fonte_data    timestamptz,               -- quando a origem publicou/atualizou
  atualizado_em timestamptz not null default now(),
  embedding     vector(1536),
  tsv           tsvector generated always as (
                  to_tsvector('portuguese', coalesce(titulo, '') || ' ' || coalesce(orgao, '') || ' ' || coalesce(cargo, '') || ' ' || texto)
                ) stored,
  unique (fonte, ref)
);

create index if not exists concurso_kb_embedding_idx on public.concurso_kb using hnsw (embedding vector_cosine_ops);
create index if not exists concurso_kb_tsv_idx on public.concurso_kb using gin (tsv);
create index if not exists concurso_kb_uf_idx on public.concurso_kb (uf);
create index if not exists concurso_kb_sem_embedding_idx on public.concurso_kb (id) where embedding is null;

alter table public.concurso_kb enable row level security;

-- Busca híbrida: semelhança de significado (embedding) + palavras (full-text).
-- Uma sigla ou nome de cidade ("Jetibá", "CBMMG") nem sempre aproxima o
-- embedding; o full-text garante que o documento certo apareça.
create or replace function public.match_concurso_kb(
  query_embedding vector(1536),
  query_text text,
  filtro_uf text default null,
  filtro_fontes text[] default null,
  match_count int default 8
)
returns table (
  id bigint,
  fonte text,
  ref text,
  titulo text,
  orgao text,
  uf text,
  cargo text,
  situacao text,
  edicao text,
  data_prova date,
  inscricao_ate date,
  url text,
  pagina int,
  texto text,
  fonte_data timestamptz,
  score float
)
language sql
stable
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('portuguese', coalesce(query_text, '')) as tsq
  ),
  candidatos as (
    select k.*,
           case when query_embedding is null or k.embedding is null then 0
                else 1 - (k.embedding <=> query_embedding) end as sim,
           ts_rank_cd(k.tsv, q.tsq) as rank
    from public.concurso_kb k, q
    where (filtro_uf is null or k.uf is null or upper(k.uf) = upper(filtro_uf))
      and (filtro_fontes is null or k.fonte = any (filtro_fontes))
      and (
        (query_embedding is not null and k.embedding is not null and 1 - (k.embedding <=> query_embedding) >= 0.55)
        or k.tsv @@ q.tsq
      )
  )
  select c.id, c.fonte, c.ref, c.titulo, c.orgao, c.uf, c.cargo, c.situacao, c.edicao,
         c.data_prova, c.inscricao_ate, c.url, c.pagina, c.texto, c.fonte_data,
         (c.sim + least(c.rank, 1) * 0.5)::float as score
  from candidatos c
  order by score desc
  limit match_count;
$$;

revoke execute on function public.match_concurso_kb(vector, text, text, text[], int) from anon, authenticated, public;
grant execute on function public.match_concurso_kb(vector, text, text, text[], int) to service_role;
