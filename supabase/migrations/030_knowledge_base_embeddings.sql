-- Fase 1 da modernização da IA: busca semântica na base de conhecimento.
-- Substitui (com fallback) a busca por palavra-chave (to_tsvector) por similaridade
-- de cosseno sobre embeddings gerados pelo Gemini (gemini-embedding-001, dim 1536).

-- Extensão pgvector (disponível no Supabase)
create extension if not exists vector;

-- Coluna de embedding (normalizado) por entrada da base
alter table knowledge_base
  add column if not exists embedding vector(1536);

-- Índice HNSW para busca rápida por similaridade de cosseno
create index if not exists idx_kb_embedding
  on knowledge_base using hnsw (embedding vector_cosine_ops);

-- Busca semântica: recebe o embedding da pergunta do aluno e devolve as
-- entradas mais parecidas (independente das palavras exatas usadas).
create or replace function match_knowledge_base(
  query_embedding vector(1536),
  search_brand text default null,
  match_count int default 3,
  min_similarity float default 0.5
)
returns table (
  id uuid,
  brand text,
  category text,
  question_pattern text,
  gold_response text,
  frequency int,
  similarity float
)
language sql
stable
as $$
  select
    kb.id,
    kb.brand,
    kb.category,
    kb.question_pattern,
    kb.gold_response,
    kb.frequency,
    1 - (kb.embedding <=> query_embedding) as similarity
  from knowledge_base kb
  where kb.is_active = true
    and kb.embedding is not null
    and (search_brand is null or kb.brand = search_brand or kb.brand = 'both')
    and 1 - (kb.embedding <=> query_embedding) >= min_similarity
  order by kb.embedding <=> query_embedding asc
  limit match_count;
$$;
