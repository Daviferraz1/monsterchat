-- Segunda mensagem do Instagram: a oferta do kit depois do material gratuito.
--
-- A automação entrega o material e a conversa morre ali. Esta migração guarda,
-- na própria regra, a mensagem de acompanhamento e o intervalo até ela — e, em
-- cada resposta enviada, o momento de disparar e o que já foi disparado.
--
-- O intervalo curto é de propósito: a janela de mensagens do Instagram é de 24h
-- a partir da última interação da pessoa. Passou disso, a Meta recusa.

begin;

alter table public.instagram_comment_rules
  add column if not exists mensagem_followup text,
  add column if not exists followup_minutos integer not null default 60;

comment on column public.instagram_comment_rules.mensagem_followup is
  'Segunda mensagem (oferta). Nula = não envia.';
comment on column public.instagram_comment_rules.followup_minutos is
  'Minutos após a primeira mensagem. A janela do Instagram é de 24h (1440).';

alter table public.instagram_comment_replies
  add column if not exists followup_em timestamptz,
  add column if not exists followup_status text,
  add column if not exists followup_erro text;

comment on column public.instagram_comment_replies.followup_status is
  'null = a enviar, sent, skipped (o lead respondeu antes) ou failed.';

create index if not exists instagram_comment_replies_followup_idx
  on public.instagram_comment_replies (followup_em)
  where followup_status is null;

commit;
