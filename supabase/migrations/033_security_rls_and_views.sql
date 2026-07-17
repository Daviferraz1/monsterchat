-- 033: Segurança do banco — corrige os ERROS do Supabase Database Linter
--
-- Achados corrigidos:
--   * rls_disabled_in_public      → RLS desligado em 6 tabelas do schema public
--   * sensitive_columns_exposed   → contact_access_credentials.password exposto sem RLS
--   * security_definer_view       → 4 views rodando com permissão do dono (bypassa RLS)
--
-- Por que é seguro ligar RLS sem policies:
--   O app acessa estas tabelas SOMENTE via service_role (SUPABASE_SERVICE_ROLE_KEY),
--   tanto nas API routes do apps/web quanto nos backends apps/api e apps/ia-atendimento.
--   service_role tem BYPASSRLS, então continua lendo/gravando normalmente.
--   O frontend (anon key) só lê/assina realtime em channels, contacts, conversations
--   e messages — NENHUMA das tabelas abaixo. Logo, ligar RLS aqui fecha o acesso
--   público via PostgREST (anon/authenticated) sem afetar o app.

-- ─── 1) RLS nas tabelas expostas sem proteção ────────────────────────────────
-- Sem policy = só service_role/postgres acessa. É exatamente o que queremos:
-- estas tabelas nunca devem ser lidas direto pelo cliente.
alter table public.contact_access_credentials enable row level security;
alter table public.ia_settings                enable row level security;
alter table public.knowledge_base             enable row level security;
alter table public.conversation_analysis      enable row level security;
alter table public.response_suggestions       enable row level security;
alter table public.analysis_metrics           enable row level security;

-- Defesa em profundidade para a tabela de SENHAS (texto puro): revoga qualquer
-- privilégio concedido por padrão aos papéis públicos do PostgREST. Assim, mesmo
-- que uma policy seja adicionada por engano no futuro, a anon key não alcança.
revoke all on public.contact_access_credentials from anon, authenticated;

-- ─── 2) Views: SECURITY DEFINER → security_invoker ───────────────────────────
-- Com security_invoker = on, a view roda com as permissões e o RLS de QUEM CONSULTA,
-- não do dono (superuser). Como só o service_role consulta estas views (rota de stats
-- e o backend de análise), nada muda no app; e se um dia a anon key tentar, o RLS das
-- tabelas-base (item 1) barra o acesso.
alter view public.v_brand_summary    set (security_invoker = on);
alter view public.v_category_summary set (security_invoker = on);
alter view public.v_top_questions    set (security_invoker = on);
alter view public.v_needs_attention  set (security_invoker = on);
