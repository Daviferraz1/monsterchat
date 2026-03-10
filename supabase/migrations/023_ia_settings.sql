-- Configurações da IA (piloto automático, etc.)
CREATE TABLE IF NOT EXISTS ia_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Valor inicial: piloto desligado
INSERT INTO ia_settings (key, value)
VALUES ('autopilot_enabled', '{"enabled": false}')
ON CONFLICT (key) DO NOTHING;
