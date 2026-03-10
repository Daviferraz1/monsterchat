-- Preço de assinatura/recorrência e informações adicionais para a IA
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_recurring_display text,
  ADD COLUMN IF NOT EXISTS price_recurring_cents integer,
  ADD COLUMN IF NOT EXISTS extra_info_for_ia text;

COMMENT ON COLUMN public.products.price_recurring_display IS 'Preço de recorrência mensal em texto (ex.: R$ 49,70/mês). Preenchido quando o produto é assinatura.';
COMMENT ON COLUMN public.products.price_recurring_cents IS 'Preço recorrente em centavos (opcional, para cálculos).';
COMMENT ON COLUMN public.products.extra_info_for_ia IS 'Informações adicionais que a IA pode consultar ao responder sobre este produto (regras, prazos, condições, etc.).';
