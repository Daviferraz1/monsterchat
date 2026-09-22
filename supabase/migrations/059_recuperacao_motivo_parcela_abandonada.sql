-- Mais um motivo de pulo, descoberto no primeiro disparo real (22/09/2026).
--
-- Uma parcela de assinatura pode estar `abandoned`: a Guru gerou a cobrança do
-- ciclo e o aluno não concluiu. Ela ia pelo `parcela_em_atraso` — o texto certo
-- —, mas sem o sufixo do botão, porque o código tirava o link de tudo que fosse
-- abandonado. A Meta recusou as três com `#131008` ("Button at index 0 of type
-- Url requires a parameter") e a mensagem não saiu.
--
-- Mandar com o link também não resolve: a fatura de uma transação abandonada
-- abre com o carimbo "Abandonada" e nenhuma forma de pagar (conferido na página
-- no mesmo dia). Não existe link honesto, então esses casos ficam de fora e
-- registrados, até haver um texto de parcela sem botão.

begin;

comment on column public.recuperacao_envios.motivo is
  'Por que foi pulado: ja_comprou, parcela_sem_template, parcela_abandonada, sem_template.';

commit;
