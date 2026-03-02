-- Redirecionamento direto: rastrear por código (ref) na mensagem, sem formulário de telefone.
-- phone_canonical passa a ser opcional; ref identifica o clique para atribuir UTM quando o lead enviar a primeira mensagem.

alter table public.lead_tracking
  alter column phone_canonical drop not null;

alter table public.lead_tracking
  add column if not exists ref text;

create unique index if not exists idx_lead_tracking_ref on lead_tracking(ref) where ref is not null;

comment on column public.lead_tracking.ref is 'Código único do clique; enviado na mensagem pré-preenchida do wa.me para atribuir UTM ao contato.';
