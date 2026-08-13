-- 037: Padrão do operador — a IA aprende COMO a equipe responde
--
-- Quando a IA sugere uma resposta e o atendente envia outra coisa, a diferença entre
-- as duas carrega informação: o jeito da casa (tamanho, tom, o que mandar junto, o
-- que nunca perguntar). Hoje só o CONTEÚDO era aprendido (vira entrada em
-- knowledge_base); a FORMA se perdia e a IA repetia o mesmo erro na conversa seguinte.
--
-- Esta tabela guarda essas "lições de estilo": regras curtas e reutilizáveis, com o
-- gatilho (quando se aplica). As ativas entram no system prompt do agente de sugestão.

CREATE TABLE IF NOT EXISTS ia_style_lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT 'both',
  -- Quando a lição se aplica ("sempre", "preço/valor do curso", "aluno sem acesso"...).
  trigger_context TEXT NOT NULL,
  -- A regra em si, no imperativo ("Mande o valor e o link na mesma mensagem").
  lesson TEXT NOT NULL,
  -- Quantas vezes o comportamento se repetiu (reforço). Ordena o que entra no prompt.
  hits INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Últimos exemplos que geraram/reforçaram a lição: [{ sugerido, enviado, at }]
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_style_lessons_active ON ia_style_lessons(is_active, hits DESC);

-- Mesma postura das demais tabelas de IA (migração 033): RLS ligado e SEM policies.
-- Só o service_role (API routes do apps/web) acessa; anon/authenticated não alcançam.
ALTER TABLE ia_style_lessons ENABLE ROW LEVEL SECURITY;
