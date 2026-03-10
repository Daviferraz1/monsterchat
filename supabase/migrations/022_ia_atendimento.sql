-- FASE 1: Análise por conversa
CREATE TABLE IF NOT EXISTS conversation_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE UNIQUE,
  brand TEXT NOT NULL DEFAULT 'ambiguous'
    CHECK (brand IN ('monster', 'fagenius', 'ambiguous')),
  category TEXT NOT NULL DEFAULT 'outro'
    CHECK (category IN ('financeiro', 'acesso', 'matricula', 'academico', 'lead', 'tecnico', 'duvida', 'reclamacao', 'documento', 'outro')),
  subcategory TEXT,
  intent TEXT,
  sentiment TEXT DEFAULT 'neutral'
    CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  urgency TEXT DEFAULT 'medium'
    CHECK (urgency IN ('low', 'medium', 'high')),
  resolution_status TEXT DEFAULT 'ongoing'
    CHECK (resolution_status IN ('resolved', 'unresolved', 'abandoned', 'ongoing')),
  response_time_seconds INTEGER,
  resolution_time_seconds INTEGER,
  turn_count INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  quality_score DECIMAL(2,1) CHECK (quality_score >= 1 AND quality_score <= 5),
  quality_notes TEXT,
  human_response_pattern TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_brand ON conversation_analysis(brand);
CREATE INDEX IF NOT EXISTS idx_ca_category ON conversation_analysis(category);
CREATE INDEX IF NOT EXISTS idx_ca_sentiment ON conversation_analysis(sentiment);
CREATE INDEX IF NOT EXISTS idx_ca_conversation ON conversation_analysis(conversation_id);

-- FASE 2: Base de conhecimento
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT 'both'
    CHECK (brand IN ('monster', 'fagenius', 'both')),
  category TEXT NOT NULL,
  question_pattern TEXT NOT NULL,
  question_variations JSONB DEFAULT '[]'::jsonb,
  gold_response TEXT NOT NULL,
  best_human_response TEXT,
  frequency INTEGER DEFAULT 1,
  avg_quality_score DECIMAL(2,1) DEFAULT 3.0,
  decision_tree TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_brand ON knowledge_base(brand);
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_active ON knowledge_base(is_active);

-- FASE 3: Sugestões de resposta
CREATE TABLE IF NOT EXISTS response_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  knowledge_entry_id UUID REFERENCES knowledge_base(id) ON DELETE SET NULL,
  suggested_response TEXT NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.00,
  was_used BOOLEAN DEFAULT false,
  was_edited BOOLEAN DEFAULT false,
  edited_response TEXT,
  operator_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rs_conversation ON response_suggestions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rs_used ON response_suggestions(was_used);

-- Métricas agregadas
CREATE TABLE IF NOT EXISTS analysis_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_date DATE NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  total_conversations INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER,
  avg_resolution_time_seconds INTEGER,
  avg_quality_score DECIMAL(2,1),
  sentiment_positive INTEGER DEFAULT 0,
  sentiment_neutral INTEGER DEFAULT 0,
  sentiment_negative INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(metric_date, brand, category)
);

-- VIEWS
CREATE OR REPLACE VIEW v_brand_summary AS
SELECT
  brand,
  COUNT(*)::bigint as total,
  ROUND(AVG(quality_score)::numeric, 1) as avg_quality,
  ROUND(AVG(response_time_seconds)::numeric) as avg_response_time_s,
  COUNT(*) FILTER (WHERE sentiment = 'negative') as negative_count,
  COUNT(*) FILTER (WHERE sentiment = 'positive') as positive_count
FROM conversation_analysis
GROUP BY brand;

CREATE OR REPLACE VIEW v_category_summary AS
SELECT
  category,
  brand,
  COUNT(*)::bigint as total,
  ROUND(AVG(quality_score)::numeric, 1) as avg_quality,
  ROUND(AVG(response_time_seconds)::numeric) as avg_response_time_s,
  COUNT(*) FILTER (WHERE resolution_status = 'resolved') as resolved,
  COUNT(*) FILTER (WHERE resolution_status = 'abandoned') as abandoned
FROM conversation_analysis
GROUP BY category, brand
ORDER BY total DESC;

CREATE OR REPLACE VIEW v_top_questions AS
SELECT
  brand,
  category,
  question_pattern,
  frequency,
  avg_quality_score,
  LEFT(gold_response, 100) as response_preview
FROM knowledge_base
WHERE is_active = true
ORDER BY frequency DESC;

CREATE OR REPLACE VIEW v_needs_attention AS
SELECT
  ca.conversation_id,
  ca.brand,
  ca.category,
  ca.intent,
  ca.quality_score,
  ca.quality_notes,
  ca.sentiment,
  c.last_message_at,
  ct.name as contact_name,
  ct.phone as contact_phone
FROM conversation_analysis ca
JOIN conversations c ON c.id = ca.conversation_id
LEFT JOIN contacts ct ON ct.id = c.contact_id
WHERE ca.quality_score <= 2
   OR ca.sentiment = 'negative'
ORDER BY ca.quality_score ASC NULLS LAST, c.last_message_at DESC;

-- Função de busca por similaridade (para sugestões)
CREATE OR REPLACE FUNCTION search_knowledge_base(
  search_text TEXT,
  search_brand TEXT DEFAULT NULL,
  max_results INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  brand TEXT,
  category TEXT,
  question_pattern TEXT,
  gold_response TEXT,
  frequency INTEGER,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.brand,
    kb.category,
    kb.question_pattern,
    kb.gold_response,
    kb.frequency,
    ts_rank(
      to_tsvector('portuguese', kb.question_pattern || ' ' || COALESCE(kb.question_variations::text, '')),
      plainto_tsquery('portuguese', search_text)
    )::real as similarity
  FROM knowledge_base kb
  WHERE kb.is_active = true
    AND (search_brand IS NULL OR kb.brand = search_brand OR kb.brand = 'both')
    AND ts_rank(
      to_tsvector('portuguese', kb.question_pattern || ' ' || COALESCE(kb.question_variations::text, '')),
      plainto_tsquery('portuguese', search_text)
    ) > 0
  ORDER BY similarity DESC, kb.frequency DESC
  LIMIT max_results;
END;
$$;
