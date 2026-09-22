-- Onboarding pós-compra: a régua que continua depois do "acesso liberado".
--
-- POR QUE EXISTE: a análise dos 75 reembolsos dos últimos 120 dias (22/09/2026)
-- mostrou que 89% dos pedidos acontecem dentro dos 7 dias de garantia, com
-- mediana de 4 dias, e que 43% deles dizem a mesma coisa com palavras
-- diferentes: "não me adaptei à plataforma", "não sabia por onde começar",
-- "plataforma confusa". Ou seja: a pessoa compra, entra, não entende o caminho
-- e desiste antes do quarto dia. Boas-vindas só fala no dia 0; ninguém mais
-- fala com ela justamente na janela em que a decisão é tomada.
--
-- O onboarding reaproveita `boas_vindas_envios` (mesma reserva por unique, mesmo
-- histórico) e só acrescenta tipos novos. Config separada porque o horário, o
-- limite por rodada e o liga/desliga são decisões próprias desta régua.

alter table boas_vindas_envios drop constraint if exists boas_vindas_envios_tipo_check;
alter table boas_vindas_envios add constraint boas_vindas_envios_tipo_check
  check (tipo = any (array['acesso'::text, 'pedido'::text, 'dia1'::text, 'dia3'::text]));

create table if not exists onboarding_config (
  id uuid primary key default gen_random_uuid(),
  ativo boolean not null default false,
  -- Templates por etapa. A Meta só aprovou `onboarding_dia3` (reclassificado
  -- como MARKETING); o do dia 1 foi recusado três vezes por INCORRECT_CATEGORY,
  -- então fica nulo até existir um aprovado — sem template, a etapa é pulada.
  template_dia1 text,
  template_dia3 text default 'onboarding_dia3',
  template_idioma text not null default 'pt_BR',
  -- Quantas horas depois da compra cada etapa sai. 24h e 72h: a primeira pega
  -- quem travou no acesso, a segunda chega antes da mediana de 4 dias.
  horas_dia1 integer not null default 24,
  horas_dia3 integer not null default 72,
  -- Prazo para desistir da etapa: passou disso, a compra é velha demais e a
  -- mensagem chegaria fora de hora (ex.: fila represada depois de uma pane).
  tolerancia_horas integer not null default 36,
  hora_inicio integer not null default 9,
  hora_fim integer not null default 20,
  max_por_execucao integer not null default 40,
  -- Mesma lista de boas-vindas: produtos da Fagenius têm outra plataforma.
  produtos_ignorados text[] not null default array['Tecnologo','Tecnólogo','Sequencial','Direito','Alteração','Taxa'],
  -- Só compras a partir daqui. Ligar a régua não pode disparar mensagem para
  -- quem comprou semana passada.
  iniciado_em timestamptz,
  link_acesso_validade_dias integer not null default 7,
  updated_at timestamptz not null default now()
);

insert into onboarding_config (ativo, iniciado_em)
select false, null
where not exists (select 1 from onboarding_config);

comment on table onboarding_config is
  'Régua de onboarding pós-compra (dia 1 e dia 3). Nasce desligada: ligar dispara mensagem de verdade.';

-- O link sem senha do onboarding é gerado pelo mesmo `criarLinkAcesso`, então a
-- origem precisa caber no CHECK — sem isso o insert do link falha e a etapa
-- inteira vira "failed".
alter table acesso_links drop constraint if exists acesso_links_origem_check;
alter table acesso_links add constraint acesso_links_origem_check
  check (origem = any (array['boas_vindas'::text, 'atendente'::text, 'ia'::text, 'onboarding'::text]));
