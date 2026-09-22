-- Link de pagamento dentro do lembrete, e template próprio para abandonado.
--
-- A fatura da Guru fica sempre em `<base>/invoice/<transaction_id>` — conferido
-- em 27 de 27 cobranças pendentes. Como `guru_sales` já guarda o
-- transaction_id, o link sai sem nenhuma consulta nova: vira o sufixo do botão
-- de URL dinâmica do template.
--
-- MAS SÓ PARA QUEM TEM COBRANÇA GERADA. Numa transação `abandoned` essa mesma
-- página abre com o carimbo "Abandonada" e nenhum botão de pagar — mandar o
-- link seria pior do que não mandar. Checkout abandonado é 2/3 da fila e ganha
-- um template próprio, sem link, convidando a responder.
--
-- Nulo em `template_abandonado` = a régua ignora os abandonados, em vez de
-- mandar um link que não paga nada.

begin;

alter table public.recuperacao_config
  add column if not exists template_abandonado text,
  add column if not exists link_base text
    not null default 'https://pagamento.monsterconcursos.com.br/invoice/';

comment on column public.recuperacao_config.template_abandonado is
  'Template para checkout abandonado (sem botão de link). Nulo = não aborda abandonados.';
comment on column public.recuperacao_config.link_base is
  'Base da URL do botão dinâmico. O sufixo enviado é o transaction_id.';

commit;
