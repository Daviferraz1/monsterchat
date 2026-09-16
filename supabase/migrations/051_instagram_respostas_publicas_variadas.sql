-- Várias respostas públicas por regra: a cada comentário uma é sorteada (sem repetir a
-- última), para os comentários do post não ficarem todos com a mesma frase.

alter table public.instagram_comment_rules
  add column if not exists respostas_publicas text[] not null default '{}';

-- Regras que já tinham uma resposta passam a ter essa como primeira variação.
update public.instagram_comment_rules
   set respostas_publicas = array[resposta_publica]
 where resposta_publica is not null
   and btrim(resposta_publica) <> ''
   and cardinality(respostas_publicas) = 0;

comment on column public.instagram_comment_rules.resposta_publica is
  'Obsoleta: substituída por respostas_publicas (mantida com a primeira variação).';

-- Qual frase foi usada em cada comentário (para não repetir a anterior).
alter table public.instagram_comment_replies
  add column if not exists public_reply_text text;
