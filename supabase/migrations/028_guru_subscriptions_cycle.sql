-- Número do ciclo atual da fatura (atualizado a cada webhook da Guru)
alter table public.guru_subscriptions
  add column if not exists current_invoice_cycle int;

comment on column public.guru_subscriptions.current_invoice_cycle is 'Ciclo da assinatura a que se refere a fatura atual (current_invoice.cycle). Atualizado a cada notificação do webhook.';
