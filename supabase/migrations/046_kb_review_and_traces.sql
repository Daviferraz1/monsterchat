-- 046_kb_review_and_traces.sql
-- Fila de curadoria da base de conhecimento + rastro do que a IA consultou.
--
-- Contexto de por que isto existe:
--
-- O aprendizado a partir das correções do atendente já rodava, mas com
-- `learn_kb_use_ai = false` ele gravava o contexto CRU da conversa como
-- pergunta-tipo e a resposta crua como resposta-ouro. O resultado são 17 mil
-- entradas onde a maioria apareceu uma única vez e todas caíram em
-- category='outro' — um arquivo de conversas, não uma base. A busca semântica
-- em cima disso devolve "uma conversa parecida", com o contexto de outro aluno
-- colado junto, e foi assim que "você pode estender para 2 anos" virou
-- "o Tecnólogo dura 2 anos" na cara do aluno.
--
-- Daqui pra frente a correção do atendente vira uma PROPOSTA que alguém aprova,
-- e só então entra na base. Entrar direto foi o que produziu o problema.

-- ---------------------------------------------------------------------------
-- 1) Rastro da sugestão
-- ---------------------------------------------------------------------------
-- Gravado na HORA em que a sugestão é gerada, não quando o atendente responde.
-- É de propósito: em 97% dos casos ele ignora a sugestão e nunca clica em nada,
-- e são justamente essas que precisamos poder abrir depois para entender por quê.
create table if not exists public.ia_suggestion_traces (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  model text,
  /** Ferramentas que o modelo realmente chamou. Array vazio = respondeu de cabeça. */
  tools_used text[] not null default '{}',
  /** Quantas voltas o laço agêntico deu. */
  iterations int not null default 0,
  category text,
  suggestion text,
  /** Preenchido quando a sugestão foi descartada pelo saneador (meta-texto, marcador). */
  discarded_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_traces_conversation on public.ia_suggestion_traces (conversation_id, created_at desc);
create index if not exists idx_traces_created on public.ia_suggestion_traces (created_at desc);
-- Para responder "com que frequência ela respondeu sem consultar nada?"
create index if not exists idx_traces_sem_ferramenta on public.ia_suggestion_traces (created_at desc)
  where cardinality(tools_used) = 0;

alter table public.ia_suggestion_traces enable row level security;

drop policy if exists "traces read" on public.ia_suggestion_traces;
create policy "traces read" on public.ia_suggestion_traces
  for select to authenticated
  using ((select public.my_role()) in ('admin', 'gestor', 'supervisor'));

-- ---------------------------------------------------------------------------
-- 2) Fila de curadoria
-- ---------------------------------------------------------------------------
create table if not exists public.kb_review_queue (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete set null,
  brand text not null default 'both' check (brand in ('monster', 'fagenius', 'both')),

  -- O par cru, para o revisor julgar com o contexto na frente
  question_context text not null,
  suggested_response text,
  actual_response text not null,

  -- A proposta normalizada (destilada por um modelo barato)
  proposed_question_pattern text not null,
  proposed_gold_response text not null,
  proposed_category text not null default 'outro',

  -- Quando já existe entrada quase igual, a proposta é de REFORÇO, não de criação
  duplicate_of uuid references public.knowledge_base(id) on delete set null,
  duplicate_similarity numeric,

  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  /** Entrada criada/reforçada na aprovação. */
  knowledge_base_id uuid references public.knowledge_base(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists idx_kb_queue_pending on public.kb_review_queue (created_at desc)
  where status = 'pending';
create index if not exists idx_kb_queue_conversation on public.kb_review_queue (conversation_id);

alter table public.kb_review_queue enable row level security;

drop policy if exists "kb_queue read" on public.kb_review_queue;
create policy "kb_queue read" on public.kb_review_queue
  for select to authenticated
  using ((select public.my_role()) in ('admin', 'gestor', 'supervisor'));

-- ---------------------------------------------------------------------------
-- 3) Modo de aprendizado
-- ---------------------------------------------------------------------------
-- 'queue' = correção vira proposta e espera aprovação (padrão novo)
-- 'auto'  = entra direto na base (o comportamento antigo, que sujou a base)
-- 'off'   = não aprende nada
insert into public.ia_settings (key, value)
values ('learn_kb_mode', '{"mode":"queue"}'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 4) Marca a origem das entradas da base
-- ---------------------------------------------------------------------------
-- Sem isso não dá para separar o que foi curado do despejo automático anterior,
-- nem medir se a curadoria melhorou a busca.
alter table public.knowledge_base
  add column if not exists source text not null default 'legacy'
    check (source in ('legacy', 'curated', 'auto', 'manual'));

comment on column public.knowledge_base.source is
  'legacy = despejo automático anterior à curadoria; curated = aprovado na fila; auto = entrou direto; manual = criado à mão no admin.';
