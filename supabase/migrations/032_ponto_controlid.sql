-- Controle de ponto (jornada) via Control iD iDFace + estrutura de equipe (setores/funcoes).
-- Fase 1 (esta migracao): fundacao de dados. Alimentada pelo Monitor do Control iD
-- (POST em /api/ponto/controlid). Relatorios de horas/atraso vem em cima destas tabelas.

-- ----------------------------------------------------------------------------
-- Estrutura de equipe (nao existia: colaboradores eram auth.users crus)
-- ----------------------------------------------------------------------------

-- Setores da empresa (Atendimento, Financeiro, Suporte...)
CREATE TABLE IF NOT EXISTS sectors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Colaboradores: fonte de verdade da equipe. Liga (opcionalmente) a auth.users.
-- user_id pode ser NULL: pessoa que bate ponto mas ainda nao tem login no chat.
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'atendente'
    CHECK (role IN ('atendente', 'supervisor', 'gestor', 'admin')),
  active BOOLEAN NOT NULL DEFAULT true,
  -- Jornada esperada (para calcular atraso / saida antecipada). Simples por ora.
  work_start TIME,
  work_end TIME,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_sector ON team_members(sector_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id) WHERE user_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- Controle de ponto
-- ----------------------------------------------------------------------------

-- Relogios de ponto. Hoje so um, mas modelado para varios / varias unidades.
CREATE TABLE IF NOT EXISTS time_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  vendor TEXT NOT NULL DEFAULT 'control_id',
  serial TEXT UNIQUE,            -- device_id/serial reportado pelo aparelho
  last_seen_at TIMESTAMPTZ,      -- ultimo evento recebido (heartbeat de saude)
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Traduz o id da pessoa cadastrada no aparelho -> colaborador (team_members).
-- O Control iD envia um user_id numerico; aqui viramos isso no colaborador certo.
CREATE TABLE IF NOT EXISTS time_clock_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  device_id UUID REFERENCES time_devices(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,   -- id da pessoa no Control iD
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (device_id, external_user_id)
);

-- Batidas de ponto. Registro imutavel: guardamos o evento cru (raw) para reprocessar
-- caso a regra de entrada/saida mude, sem perder nada.
CREATE TABLE IF NOT EXISTS time_punches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL, -- NULL se ainda nao mapeado
  device_id UUID REFERENCES time_devices(id) ON DELETE SET NULL,
  external_user_id TEXT,                 -- id no Control iD (mesmo sem mapeamento)
  punched_at TIMESTAMPTZ NOT NULL,       -- momento da batida (relogio do aparelho)
  direction TEXT NOT NULL DEFAULT 'unknown'
    CHECK (direction IN ('in', 'out', 'unknown')),
  source TEXT NOT NULL DEFAULT 'monitor'
    CHECK (source IN ('monitor', 'reconcile', 'manual')),
  dedup_key TEXT NOT NULL UNIQUE,        -- anti-duplicidade (device serial + id do log)
  raw JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punches_member_time ON time_punches(team_member_id, punched_at DESC);
CREATE INDEX IF NOT EXISTS idx_punches_time ON time_punches(punched_at DESC);
CREATE INDEX IF NOT EXISTS idx_punches_unmapped ON time_punches(external_user_id)
  WHERE team_member_id IS NULL;

-- ----------------------------------------------------------------------------
-- RLS: dados de RH sao sensiveis. Acesso apenas via service_role (servidor).
-- Nenhuma policy permissiva para o cliente = cliente anon/authenticated nao le.
-- ----------------------------------------------------------------------------
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_punches ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE team_members IS 'Colaboradores (setor + cargo); liga opcionalmente a auth.users. Fonte de verdade da equipe.';
COMMENT ON TABLE time_punches IS 'Batidas de ponto do Control iD; raw guarda o evento cru para reprocessamento. Acesso via service_role.';
COMMENT ON COLUMN time_punches.dedup_key IS 'Chave unica (serial do aparelho + id do log) para nao duplicar a mesma batida.';
