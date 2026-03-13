-- Assinaturas do Digital Guru (webhook subscription). Base para dashboard de atrasos e cobrança.
-- Ref: https://docs.digitalmanager.guru/developers/webhook-para-assinaturas
create table public.guru_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null,
  internal_id text,
  subscription_code text,
  contact_id uuid references public.contacts(id) on delete set null,

  -- Assinante (dados completos para cobrança)
  subscriber_email text,
  subscriber_name text,
  subscriber_doc text,
  subscriber_phone text,
  subscriber_phone_local_code text,
  subscriber_address text,
  subscriber_address_number text,
  subscriber_address_comp text,
  subscriber_address_district text,
  subscriber_address_city text,
  subscriber_address_state text,
  subscriber_address_zip_code text,
  subscriber_address_country text,

  -- Status e fatura atual
  last_status text,
  current_invoice_id text,
  current_invoice_status text,
  current_invoice_charge_at date,
  current_invoice_value numeric(12,2),
  current_invoice_period_start date,
  current_invoice_period_end date,
  current_invoice_payment_url text,

  -- Produto/oferta
  product_id text,
  product_name text,
  offer_id text,
  offer_name text,

  -- Datas do ciclo
  next_cycle_at date,
  cycle_end_date date,
  cycle_start_date date,
  started_at timestamptz,
  last_status_at timestamptz,
  canceled_at timestamptz,
  cancel_at_cycle_end boolean default false,
  cancel_reason text,
  cancelled_by_name text,
  cancelled_by_email text,
  cancelled_by_date timestamptz,

  -- Cobrança
  payment_method text,
  charged_every_days int,
  charged_times int,
  next_cycle_value numeric(12,2),

  -- Atraso (preenchido quando fatura não paga e data de cobrança já passou)
  is_overdue boolean default false,
  days_overdue int,
  overdue_since date,

  raw_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint guru_subscriptions_subscription_id_unique unique (subscription_id)
);

create index idx_guru_subscriptions_overdue on guru_subscriptions(is_overdue) where is_overdue = true;
create index idx_guru_subscriptions_last_status on guru_subscriptions(last_status);
create index idx_guru_subscriptions_contact_id on guru_subscriptions(contact_id);
create index idx_guru_subscriptions_subscriber_email on guru_subscriptions(subscriber_email);
create index idx_guru_subscriptions_subscriber_phone on guru_subscriptions(subscriber_phone);
create index idx_guru_subscriptions_next_cycle_at on guru_subscriptions(next_cycle_at);
create index idx_guru_subscriptions_updated_at on guru_subscriptions(updated_at desc);

alter table guru_subscriptions enable row level security;

create policy "Authenticated can read guru_subscriptions"
  on guru_subscriptions for select
  to authenticated
  using (true);

create policy "Service role can manage guru_subscriptions"
  on guru_subscriptions for all
  to service_role
  using (true)
  with check (true);

comment on table public.guru_subscriptions is 'Assinaturas Guru (webhook subscription). Usado no dashboard de assinaturas e atrasos.';
