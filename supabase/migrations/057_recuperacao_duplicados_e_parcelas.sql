-- Dois filtros que faltavam, e que sozinhos invalidariam a régua.
--
-- Medido na fila real de 7 dias (88 cobranças pendentes):
--
-- 1. PEDIDO DUPLICADO — 41 delas (47%) são de gente que JÁ COMPROU o mesmo
--    produto. A pessoa tenta o checkout, abandona, tenta de novo e paga; ficam
--    duas ou três transações abandonadas e uma aprovada. Mandar "sua matrícula
--    ficou incompleta" para quem já é aluno não é só inútil: queima a relação e
--    faz o aluno duvidar do próprio pagamento.
--
-- 2. PARCELA DE ASSINATURA EM ATRASO — das 23 com cobrança gerada, 14 são
--    ciclos de recorrência (ciclo 1 a 24). Também são alunos matriculados, com
--    uma parcela em aberto. Merecem lembrete, mas OUTRO texto: "sua matrícula
--    ficou pendente" está errado, a matrícula existe há meses.
--
-- O tipo vem da Guru no momento do envio (`invoice.type = 'cycle'`), que é a
-- única fonte que distingue ciclo de compra única — `guru_sales` não guarda.
--
-- `template_parcela` nulo = a régua não aborda parcela atrasada, em vez de
-- mandar o texto de matrícula nova para um aluno antigo.

begin;

alter table public.recuperacao_config
  add column if not exists template_parcela text;

comment on column public.recuperacao_config.template_parcela is
  'Template da parcela de assinatura em atraso. Nulo = não aborda esses casos.';

-- O log passa a registrar também o que NÃO foi enviado e por quê: sem isso,
-- um filtro novo é invisível e ninguém descobre que ele está exagerando.
alter table public.recuperacao_envios
  drop constraint if exists recuperacao_envios_status_check;

alter table public.recuperacao_envios
  add constraint recuperacao_envios_status_check
  check (status in ('sent', 'failed', 'skipped'));

alter table public.recuperacao_envios
  add column if not exists motivo text;

comment on column public.recuperacao_envios.motivo is
  'Por que foi pulado: ja_comprou, parcela_sem_template, sem_template.';

create index if not exists recuperacao_envios_status_idx
  on public.recuperacao_envios (status, created_at desc);

commit;
