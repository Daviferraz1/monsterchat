-- Tipo do produto (transação vs assinatura) e segundo link de checkout para assinatura
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'one_time'
    CHECK (product_type IN ('one_time', 'subscription')),
  ADD COLUMN IF NOT EXISTS checkout_url_subscription text;

COMMENT ON COLUMN public.products.product_type IS 'one_time = transação/compra única; subscription = assinatura (pode ter link à vista + link mensal).';
COMMENT ON COLUMN public.products.checkout_url_subscription IS 'Link de checkout para plano mensal/recorrente. Usado quando product_type = subscription.';
