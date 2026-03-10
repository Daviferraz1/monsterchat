# IA Atendimento — Monster / FAGENIUS

Sistema de IA em 3 camadas para análise e sugestão de respostas no atendimento WhatsApp (Monster Concursos + FAGENIUS).

## Pré-requisitos

1. **Rodar a migração SQL** no Supabase (SQL Editor):
   - Arquivo: `supabase/migrations/022_ia_atendimento.sql` (na raiz do projeto)

2. **Mensagens para a IA:** o sistema usa **apenas mensagens de texto** (`content_type = 'text'`, `body` não nulo nem vazio). Áudio, imagem, sticker etc. são ignorados para não enviar lixo à API.

3. **Metadata do contato (Guru):** quando `channel_type = 'guru'` e o `metadata` do contato tem **`digital_guru.products`**, a IA usa esses dados na classificação (aluno, curso comprado, status de pagamento), melhorando a precisão Monster vs FAGENIUS.

4. **Configurar `.env`** (copiar de `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `ANTHROPIC_API_KEY`

5. **Instalar dependências** (na raiz do projeto):
   ```bash
   npm install
   ```

## Scripts

| Comando | Descrição |
|--------|-----------|
| `npm run test:classify` | Classifica 5 conversas recentes (teste antes do batch) |
| `npm run phase:all` | Roda as 3 fases: classificar → base de conhecimento → relatório |
| `npm run phase:report` | Gera só o relatório (TXT + JSON em `reports/`) com os números atuais |
| `npm run phase:weekly` | Melhora a base com as edições da última semana |

Execute a partir do pacote:

```bash
npm run test:classify --workspace=ia-atendimento-monster
npm run phase:all --workspace=ia-atendimento-monster
npm run phase:weekly --workspace=ia-atendimento-monster
```

Ou dentro de `apps/ia-atendimento`:

```bash
cd apps/ia-atendimento
npm run test:classify
npm run phase:all
npm run phase:weekly
```

## Integração no MonsterChat (Vercel)

O app **web** já integra a IA:

- **Piloto automático**: em **Configurações → IA Atendimento** o admin liga/desliga. Quando ativo, cada mensagem recebida (webhook WhatsApp) é classificada pela IA e o operador vê sugestões de resposta no chat.
- **Base de conhecimento**: **Configurações → IA Atendimento → Ver base de conhecimento** lista as entradas geradas pelo `phase:all`.
- **Cron semanal**: a Vercel chama `/api/ia/cron/weekly` (domingo 03:00 UTC) para melhorar a base com as edições da semana.

**Variáveis no Vercel (app web):**

- `ANTHROPIC_API_KEY` — para classificação e melhoria semanal.
- `CRON_SECRET` (opcional) — se definido, o cron envia `Authorization: Bearer <CRON_SECRET>`; use o mesmo valor no Vercel Cron para proteger a rota.

## Relatórios

Após `phase:all`, os relatórios são gerados em `apps/ia-atendimento/reports/` (JSON + TXT).

## Views úteis no Supabase

- `v_brand_summary` — totais por marca
- `v_category_summary` — totais por categoria/marca
- `v_top_questions` — perguntas mais frequentes
- `v_needs_attention` — conversas com qualidade ≤ 2 ou sentimento negativo
