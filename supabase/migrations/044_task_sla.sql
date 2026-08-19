-- 044: Limite de tempo para resolver (SLA) nas tarefas.
--
-- due_at responde "quando vence". Sozinho, ele não responde "qual era o combinado"
-- — se alguém empurra o prazo, o compromisso original some e o relatório passa a
-- dizer que tudo foi entregue no prazo. Por isso o limite acordado fica gravado
-- em separado, no momento da criação.

alter table public.task_types
  add column if not exists default_sla_minutes integer
    check (default_sla_minutes is null or default_sla_minutes > 0);

comment on column public.task_types.default_sla_minutes is
  'Limite padrão para resolver, em minutos. Preenche o prazo ao escolher o tipo.';

alter table public.tasks
  add column if not exists sla_minutes integer
    check (sla_minutes is null or sla_minutes > 0);

comment on column public.tasks.sla_minutes is
  'Limite acordado na criação, em minutos. Guardado à parte de due_at para o
   relatório continuar honesto mesmo se o prazo for adiado depois.';

-- Padrões razoáveis para começar; dá para ajustar em tela.
-- Financeiro é o mais curto de propósito: boleto vencido tem multa.
update public.task_types set default_sla_minutes = 2 * 24 * 60 where name = 'Financeiro'              and default_sla_minutes is null;
update public.task_types set default_sla_minutes = 5 * 24 * 60 where name = 'Compras e orçamento'     and default_sla_minutes is null;
update public.task_types set default_sla_minutes = 7 * 24 * 60 where name = 'Projeto / TI'            and default_sla_minutes is null;
update public.task_types set default_sla_minutes = 3 * 24 * 60 where name = 'Secretaria e pedagógico' and default_sla_minutes is null;
