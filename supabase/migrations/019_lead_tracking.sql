-- Rastreamento de origem de leads (Facebook Ads, Instagram etc.)
-- Usado quando o lead clica em um link com UTM e informa o telefone antes de ir para o WhatsApp.
-- Ao receber a primeira mensagem no WhatsApp, o webhook associa o UTM ao contato.

create table if not exists public.lead_tracking (
  id uuid primary key default gen_random_uuid(),
  phone_canonical text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  created_at timestamptz default now()
);

create index idx_lead_tracking_phone_created on lead_tracking(phone_canonical, created_at desc);

comment on table public.lead_tracking is 'Captura UTM de campanhas antes do lead enviar mensagem no WhatsApp; usado para atribuir origem ao contato.';

alter table public.lead_tracking enable row level security;

-- Nenhuma policy para usuários anon/authenticated: apenas service role (API) acessa.
