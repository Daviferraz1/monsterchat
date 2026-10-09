-- 063: Registro das decisões do piloto automático
--
-- O piloto novo (lib/api/ia/piloto.ts) roda a cada minuto, usa o mesmo agente das
-- sugestões e só envia sozinho o que passa no filtro de risco. Cada decisão fica
-- aqui: no modo ENSAIO ele não envia nada e é por esta tabela que se compara o que
-- ele mandaria com o que a equipe mandou; no modo ATIVO é o histórico do que foi
-- enviado e do que foi passado para a equipe, e por quê.
--
-- (O piloto antigo tentava gravar escalonamentos em internal_notes com author_id
-- nulo; a coluna é NOT NULL e esses registros nunca foram gravados.)

create table if not exists public.ia_piloto_log (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  mensagem_id     uuid,                    -- última mensagem do aluno que motivou a decisão
  modo            text not null check (modo in ('ensaio', 'ativo')),
  decisao         text not null check (decisao in ('enviou', 'enviaria', 'equipe', 'nada')),
  assunto         text,                    -- apresentacao, acesso, pagamento…
  motivo          text,                    -- por que passou para a equipe (ou não respondeu)
  texto           text,                    -- o que enviou / enviaria
  created_at      timestamptz not null default now()
);

create index if not exists ia_piloto_log_conversa_idx on public.ia_piloto_log (conversation_id, created_at desc);
create index if not exists ia_piloto_log_data_idx on public.ia_piloto_log (created_at desc);

alter table public.ia_piloto_log enable row level security;
-- Leitura para a equipe logada (painel do piloto); escrita só pelo service role.
create policy ia_piloto_log_leitura on public.ia_piloto_log for select to authenticated using (true);
