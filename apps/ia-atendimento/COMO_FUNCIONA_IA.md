# Como funciona a IA no MonsterChat — Passo a passo

## Visão geral

A IA atua em **3 camadas**: **Observar** (classificar conversas), **Aprimorar** (gerar base de conhecimento) e **Sugerir** (respostas em tempo real). Parte roda em **batch** (script) e parte em **tempo real** (webhook + frontend).

---

## 1. Preparação (uma vez)

1. **Migrações no Supabase**  
   Rodar no SQL Editor:
   - `022_ia_atendimento.sql` — cria tabelas `conversation_analysis`, `knowledge_base`, `response_suggestions`, `analysis_metrics`, views e função `search_knowledge_base`.
   - `023_ia_settings.sql` — cria `ia_settings` (liga/desliga do piloto automático).

2. **Variáveis de ambiente**  
   No `.env` da raiz ou em `apps/ia-atendimento/.env`:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`)
   - `ANTHROPIC_API_KEY` (API Claude)

3. **Rodar o batch inicial**  
   Na raiz do projeto:
   ```bash
   npm run phase:all --workspace=ia-atendimento-monster
   ```
   Isso executa as 3 fases abaixo sobre o histórico já salvo.

---

## 2. Fase 1 — OBSERVAR (classificar conversas)

**O que faz:** classifica cada conversa com Claude Haiku e grava o resultado.

**Passo a passo:**

1. O script lê da tabela `conversations` todas as conversas (e ignora as que já estão em `conversation_analysis`).
2. Para cada conversa:
   - Busca **apenas mensagens de texto** em `messages`: `content_type = 'text'`, `body IS NOT NULL`, `body != ''` (áudio, imagem, sticker etc. são ignorados para não enviar lixo à IA).
   - Busca o contato em `contacts` e usa o **metadata** (veja item abaixo).
   - Monta um texto no formato: `[data/hora] ALUNO: texto` / `[data/hora] OPERADOR: texto`.
   - Envia esse texto para a API **Claude Haiku** com um prompt fixo.
   - A IA devolve um JSON com: **marca** (monster/fagenius/ambiguous), **categoria** (financeiro, acesso, matrícula, etc.), **intenção**, **sentimento**, **urgência**, **status de resolução**, **nota de qualidade** (1–5) e **padrão da resposta humana**.
3. O script calcula:
   - **Tempo de primeira resposta** (diferença entre primeira mensagem do aluno e primeira do operador).
   - **Tempo de resolução** (entre primeira e última mensagem).
4. Grava tudo na tabela **`conversation_analysis`** (uma linha por conversa).
5. Para respeitar o limite da API (50 req/min), processa em **lotes de 5** com **6 segundos** de pausa entre lotes. Em 429 (rate limit), espera 65 s e tenta de novo.

**Metadata do contato (Guru):** quando o canal é Guru (`channel_type = 'guru'`) e o `metadata` do contato tem **`digital_guru.products`**, a IA usa esses dados na classificação: saber se o contato é aluno, qual curso/produto comprou e status de pagamento. Isso **melhora bastante a precisão** na distinção Monster vs FAGENIUS. O prompt envia o JSON do `contact.metadata` e uma instrução explícita para usar `digital_guru.products` quando existir.

**Resultado:** você passa a ter, no banco, uma “ficha” de cada conversa (marca, categoria, sentimento, qualidade, tempos).

---

## 3. Fase 2 — APRIMORAR (base de conhecimento)

**O que faz:** a partir das conversas já classificadas, gera “perguntas-tipo” e “respostas ouro” e guarda na base.

**Passo a passo:**

1. O script lê **`conversation_analysis`** e agrupa por **marca + categoria** (ex.: monster + financeiro, fagenius + matrícula).
2. Para cada grupo com **2 ou mais** conversas:
   - Pega até **20 conversas** desse grupo.
   - Busca só mensagens de **texto** (`content_type = 'text'`, `body` não nulo nem vazio).
   - Monta o texto dessas conversas e envia para **Claude Sonnet** (modelo mais capaz).
   - O prompt pede: identificar **perguntas que se repetem**, criar **resposta ouro** (melhor versão), **variações da pergunta**, **árvore de decisão** quando fizer sentido (ex.: matrícula, boleto).
3. A IA devolve uma **lista de entradas** em JSON (pergunta-tipo, variações, resposta ouro, melhor resposta humana, frequência, tags, etc.).
4. O script insere cada entrada na tabela **`knowledge_base`** (com marca, categoria, `question_pattern`, `gold_response`, etc.).

**Resultado:** a tabela **`knowledge_base`** vira a “memória” da IA: perguntas comuns e a melhor resposta sugerida para cada uma (tom Monster vs FAGENIUS já considerado no prompt).

---

## 4. Fase 3 — Relatório

**O que faz:** resume números e gera arquivos para você analisar.

1. Lê **`conversation_analysis`** e **`knowledge_base`** (e as views `v_brand_summary`, `v_category_summary`, etc.).
2. Calcula totais, médias (qualidade, tempo de resposta), sentimento (positivo/neutro/negativo) e preenche **`analysis_metrics`**.
3. Gera dois arquivos na pasta **`reports/`**:
   - **JSON:** todos os dados do resumo.
   - **TXT:** mesmo resumo em texto legível (totais por marca, top perguntas, conversas que precisam de atenção).

---

## 5. Tempo real — Quando chega uma mensagem (WhatsApp)

**O que faz:** classifica a mensagem nova e (se o piloto estiver ligado) atualiza a análise da conversa.

**Passo a passo:**

1. O **webhook** do WhatsApp (`apps/web/src/lib/api/webhooks/whatsapp.ts`) recebe a mensagem, salva em `messages` e atualiza a conversa. Só classifica se a mensagem tiver **texto** (áudio/imagem/sticker não são enviados à IA).
2. **Se o piloto automático estiver ativo** (valor em **`ia_settings`**):
   - Chama **`classifyIncomingMessage(conversationId, textoDaMensagem, nomeDoContato, metadataDoContato)`**.
   - O **metadata do contato** (incluindo `digital_guru.products` quando existir) é enviado à IA para melhorar Monster vs FAGENIUS.
   - A função usa **Claude Haiku** com o texto da última mensagem e recebe: marca, categoria, intenção, sentimento, urgência.
   - Faz **upsert** em **`conversation_analysis`** para essa conversa (atualiza a “ficha” com a nova mensagem).

Assim, as conversas vão sendo **reclassificadas** conforme o cliente manda novas mensagens, sem rodar o batch de novo.

---

## 6. Tempo real — Sugestão de resposta no chat

**O que faz:** quando o operador abre uma conversa, o sistema sugere uma resposta com base na **última mensagem do cliente**, sem chamar a API em tempo real.

**Passo a passo:**

1. No frontend, ao abrir uma conversa, o **ChatWindow** sabe qual é a **última mensagem do contato** (inbound).
2. Se o **piloto automático estiver ativo**, o **MessageInput** chama a API **`POST /api/ia/suggestion`** com esse texto (e opcionalmente a marca).
3. A API **não usa IA**: chama a função SQL **`search_knowledge_base(texto, marca, 3)`** no Supabase.
   - A função usa **busca full-text em português** (`to_tsvector` / `plainto_tsquery`) em `question_pattern` e `question_variations`.
   - Devolve até 3 entradas ordenadas por **similaridade** e **frequência**.
4. O frontend mostra um **bloco “Sugestão de resposta”** com nível de confiança (high/medium/low) e o texto da **resposta ouro** da melhor entrada.
5. O operador pode:
   - Clicar em **“Usar esta sugestão”** (o texto vai para o campo de mensagem).
   - Editar e enviar, ou ignorar.
6. Ao **enviar**, se o operador tiver usado (ou editado) a sugestão, o frontend chama **`POST /api/ia/feedback`** com: conversa, sugestão usada, confiança, se foi usada tal qual ou editada e o texto final. Isso grava em **`response_suggestions`**.

**Resultado:** sugestões vêm da **base de conhecimento** (PostgreSQL), com **custo zero** por consulta; o feedback serve para melhorar a base depois (ver item 8).

---

## 7. Piloto automático (liga/desliga)

- O estado fica na tabela **`ia_settings`** (chave `autopilot_enabled`, valor `{ "enabled": true/false }`).
- **GET /api/ia/autopilot** — lê esse valor (usado na página “IA Atendimento” e no chat para mostrar ou não a sugestão).
- **POST /api/ia/autopilot** — atualiza (toggle na página).
- **Webhook:** só chama **classifyIncomingMessage** se `enabled === true`.
- **Frontend (sugestão):** só busca sugestão e mostra o bloco se o piloto estiver ativo.

---

## 8. Melhoria semanal (cron)

**O que faz:** usa as **edições** que o operador fez nas sugestões para **melhorar as respostas ouro** na base.

**Passo a passo:**

1. Um **cron** (ex.: Vercel Cron, domingo 03:00 UTC) chama **GET /api/ia/cron/weekly** (protegido por `CRON_SECRET` se configurado).
2. A rota chama **`weeklyImprovement()`**:
   - Busca em **`response_suggestions`** os registros da **última semana** em que **`was_edited = true`** e **`edited_response`** não é nulo.
   - Agrupa por **`knowledge_entry_id`** (cada entrada da base que foi “editada” pelo operador).
   - Para cada entrada:
     - Lê a **resposta ouro atual** em **`knowledge_base`**.
     - Monta um prompt para **Claude Sonnet** com: resposta atual + exemplos “original → editado pelo operador” (+ feedback se houver).
     - Pede uma **nova resposta ouro** que incorpore as correções do operador (tom Monster/FAGENIUS mantido).
   - Faz **UPDATE** em **`knowledge_base`** com a nova **`gold_response`**.

**Resultado:** a base de conhecimento **evolui** com o uso real (quando o operador corrige a sugestão, isso vira insumo para a próxima versão da resposta ouro).

---

## Resumo do fluxo

| Etapa              | Quando        | Onde roda        | IA?   |
|--------------------|---------------|-------------------|-------|
| Classificar histórico | 1x (script)   | `phase:all` Fase 1 | Sim (Haiku) |
| Gerar base         | 1x (script)   | `phase:all` Fase 2 | Sim (Sonnet) |
| Relatório          | 1x (script)   | `phase:all` Fase 3 | Não   |
| Classificar msg nova | A cada msg    | Webhook WhatsApp | Sim (Haiku), só se piloto ligado |
| Sugestão no chat   | Ao abrir conversa | Frontend → API  | Não (PostgreSQL) |
| Feedback (usou/editou) | Ao enviar msg | Frontend → API  | Não   |
| Melhoria semanal   | 1x por semana | Cron → API       | Sim (Sonnet) |

---

## Onde está cada coisa no código

- **Batch (3 fases):** `apps/ia-atendimento/src/run-all-phases.ts`
- **Classificar mensagem (tempo real):** `apps/web/src/lib/api/ia/classify.ts`
- **Buscar sugestão (SQL):** `apps/web/src/lib/api/ia/suggestion.ts` + função `search_knowledge_base` na migração 022
- **Feedback:** `apps/web/src/lib/api/ia/feedback.ts`
- **Piloto (liga/desliga):** `apps/web/src/lib/api/ia/autopilot.ts`
- **Melhoria semanal:** `apps/web/src/lib/api/ia/weekly.ts`
- **Chamada no webhook:** `apps/web/src/lib/api/webhooks/whatsapp.ts` (trecho que chama `classifyIncomingMessage`)
- **Frontend:** página `apps/web/src/app/(dashboard)/settings/ia/page.tsx`, base de conhecimento `.../settings/ia/knowledge/page.tsx`, sugestão no `MessageInput.tsx`

Se quiser, na próxima mensagem podemos focar em um único fluxo (por exemplo “só o que acontece quando chega uma mensagem”) e desenhar em mais detalhe.
