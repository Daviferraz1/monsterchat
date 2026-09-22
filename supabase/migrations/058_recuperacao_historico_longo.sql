-- O histórico de compras precisa de janela própria, bem maior que a da fila.
--
-- Bug encontrado pela simulação ANTES de qualquer envio: `jaComprou` era
-- calculado sobre as mesmas linhas da fila (7 dias). Quem paga a parcela 3 de
-- 12 teve as anteriores aprovadas há 30 ou 60 dias — fora da janela. Resultado:
-- a parcela atrasada era lida como matrícula nova, e o aluno receberia "sua
-- matrícula ficou pendente" depois de meses estudando.
--
-- Na fila real isso valia 13 das 15 mensagens que sairiam.

begin;

alter table public.recuperacao_config
  add column if not exists historico_dias integer not null default 365;

comment on column public.recuperacao_config.historico_dias is
  'Janela para saber se o contato já comprou o produto. Grande de propósito: uma assinatura de 18 meses tem parcelas aprovadas muito antes da que está em atraso.';

commit;
