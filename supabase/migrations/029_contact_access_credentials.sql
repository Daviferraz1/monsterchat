-- Credenciais de acesso (login/senha) enviadas por e-mail (Resend) para plataformas Monster
-- Permite ao atendente reenviar o acesso quando o aluno diz que não recebeu
CREATE TABLE IF NOT EXISTS contact_access_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('monster_study', 'monster_questoes', 'monster_sound')),
  login TEXT NOT NULL,
  password TEXT NOT NULL,
  resend_email_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contact_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_cac_contact ON contact_access_credentials(contact_id);
CREATE INDEX IF NOT EXISTS idx_cac_resend ON contact_access_credentials(resend_email_id) WHERE resend_email_id IS NOT NULL;

COMMENT ON TABLE contact_access_credentials IS 'Login e senha enviados por e-mail (Resend) para plataformas Monster; usado para reenviar acesso ao aluno no chat';
