-- Catálogo de produtos (Monster / FAGENIUS) para o system prompt da IA
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL CHECK (brand IN ('monster', 'fagenius')),
  name text NOT NULL,
  slug text,
  category text,
  description text,
  target_exam text,
  target_role text,
  price_display text NOT NULL,
  price_cents integer,
  checkout_url text NOT NULL,
  sales_page_url text,
  includes text,
  duration text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'coming_soon', 'sold_out', 'discontinued')),
  highlights text,
  notes text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_exam ON products(target_exam);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can manage products"
  ON products FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage products"
  ON products FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Status de conversa para escalonamento (IA encaminhou para humano)
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('open', 'pending', 'closed', 'snoozed', 'aguardando_interno'));

-- Notas internas: permitir author_id null para notas criadas pelo sistema/IA
ALTER TABLE public.internal_notes
  ALTER COLUMN author_id DROP NOT NULL;

COMMENT ON COLUMN public.internal_notes.author_id IS 'Null quando a nota foi criada pelo sistema (ex.: escalonamento IA).';
