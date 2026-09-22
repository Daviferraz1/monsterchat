-- Template próprio para o segundo lembrete.
--
-- Com um template só, a pessoa recebia a MESMA mensagem duas vezes, com três
-- dias de intervalo — o que lê como robô quebrado, não como lembrete. O segundo
-- contato é outro momento: o prazo está vencendo e a pergunta já não é "você
-- esqueceu?", é "ainda quer?".
--
-- Nulo = usa o template da etapa 1, então quem não quiser dois textos não
-- precisa fazer nada.

begin;

alter table public.recuperacao_config
  add column if not exists template_nome_etapa2 text;

comment on column public.recuperacao_config.template_nome_etapa2 is
  'Template do segundo lembrete. Nulo = repete o da etapa 1.';

commit;
