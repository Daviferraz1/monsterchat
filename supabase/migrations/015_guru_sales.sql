-- Últimas vendas do Digital Guru (para o atendente ver sem sair do sistema)
create table public.guru_sales (
  id uuid primary key default gen_random_uuid(),
  transaction_id text,
  contact_email text,
  contact_phone text,
  contact_name text,
  product_names text not null,
  status text,
  sold_at timestamptz not null,
  contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz default now()
);

create index idx_guru_sales_sold_at on guru_sales(sold_at desc);
create index idx_guru_sales_contact_id on guru_sales(contact_id);

alter table guru_sales enable row level security;

create policy "Authenticated can read guru_sales"
  on guru_sales for select
  to authenticated
  using (true);

create policy "Service role can manage guru_sales"
  on guru_sales for all
  to service_role
  using (true)
  with check (true);
