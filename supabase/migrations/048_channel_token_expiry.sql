-- Validade do token do canal.
--
-- Token de Instagram Login ("IGA...") expira: 60 dias no formato longo, 1 hora no curto.
-- Quando vence, o canal para de enviar e de buscar perfil sem nenhum aviso, e o sintoma é
-- idêntico ao de token errado — o que torna o diagnóstico caro justamente na hora em que o
-- atendimento está parado.
--
-- Guardar a validade permite que o cron /api/instagram/cron/refresh-token renove com folga,
-- e que o diagnóstico mostre quantos dias faltam antes de quebrar.
--
-- Fica nulo para canais cujo token não expira (Page token de usuário do sistema, WhatsApp).

alter table public.channels
  add column if not exists token_expires_at timestamptz;

comment on column public.channels.token_expires_at is
  'Quando o access_token expira. Nulo = não expira (ex.: Page token de usuário do sistema).';

-- O cron varre só os canais que estão perto de vencer.
create index if not exists idx_channels_token_expires_at
  on public.channels (token_expires_at)
  where token_expires_at is not null;
