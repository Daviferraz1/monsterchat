-- Detalhes da venda: meio de pagamento e endereço
alter table public.guru_sales
  add column if not exists payment_method text,
  add column if not exists payment_total numeric(12,2),
  add column if not exists address_full text;
