# ✅ Próximos passos — MonsterChat no ar

Seu app está em: **https://monsterchat-xi.vercel.app**

Para começar a receber e enviar mensagens do WhatsApp, siga esta ordem.

---

## 1. Configurar variáveis no Vercel

1. Abra o projeto no Vercel: https://vercel.com/dashboard  
2. Vá em **Settings** → **Environment Variables**  
3. Adicione (e salve) cada variável abaixo.

**Obrigatórias para o app funcionar:**

| Nome | Valor | Onde pegar |
|------|--------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon key) | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (service_role) | Supabase → Settings → API |
| `META_APP_SECRET` | Segredo do app | Meta for Developers → Configurações → Básico |
| `META_WEBHOOK_VERIFY_TOKEN` | Um texto que você inventar (ex: `meu_token_123`) | Você escolhe |
| `WHATSAPP_PHONE_NUMBER_ID` | Ex: `247994065074259` | Meta → Configuração da API |
| `WHATSAPP_ACCESS_TOKEN` | Token gerado na Meta | Meta → Configuração da API → Gerar token |
| `WHATSAPP_WABA_ID` | Ex: `285585611312219` | Meta → Configuração da API |

4. Depois de salvar, faça um **Redeploy** (Deployments → ⋮ no último deploy → Redeploy).

---

## 2. Banco de dados no Supabase

1. Crie um projeto em https://supabase.com/dashboard (se ainda não tiver).  
2. No Supabase, vá em **SQL Editor** e rode as migrations na ordem:
   - Abra cada arquivo em `supabase/migrations/` (001 até 008)  
   - Copie o conteúdo e execute no SQL Editor  
   Ou use a CLI: `supabase link` + `supabase db push`  
3. Crie o bucket de mídia: **Storage** → **New bucket** → nome `media` → **Public bucket** → Create.

---

## 3. Cadastrar o canal WhatsApp no banco

O webhook só processa mensagens se existir um canal com o `phone_number_id` correto.

No Supabase → **Table Editor** → tabela **channels**, adicione uma linha:

| Coluna | Valor |
|--------|--------|
| `type` | `whatsapp` |
| `name` | Nome que quiser (ex: "WhatsApp Principal") |
| `external_id` | Mesmo valor de `WHATSAPP_PHONE_NUMBER_ID` (ex: `247994065074259`) |
| `business_account_id` | Mesmo valor de `WHATSAPP_WABA_ID` (ex: `285585611312219`) |
| `access_token` | Mesmo valor de `WHATSAPP_ACCESS_TOKEN` |
| `is_active` | `true` |

Salve. Sem esse registro, as mensagens do webhook não viram conversas no inbox.

---

## 4. Configurar o webhook na Meta

1. Meta for Developers → seu app → **Configuração** → **Webhooks**.  
2. **URL de callback:**  
   `https://monsterchat-xi.vercel.app/api/webhooks/whatsapp`  
3. **Verificar token:** o mesmo que você colocou em `META_WEBHOOK_VERIFY_TOKEN`.  
4. Clique em **Verificar e salvar**.  
5. Inscreva os campos: **messages** e **message_status**.

---

## 5. Testar

1. Acesse https://monsterchat-xi.vercel.app/inbox  
2. Envie uma mensagem do seu WhatsApp para o número conectado ao app.  
3. A conversa deve aparecer na lista e você poderá abrir e responder.

Se aparecer "Carregando conversas..." para sempre, confira:
- Variáveis no Vercel (principalmente Supabase)  
- Migrations rodadas no Supabase  
- Canal cadastrado na tabela `channels` com `external_id` e `access_token` corretos.

---

## Resumo rápido

1. Variáveis no Vercel (Supabase + Meta) → Redeploy  
2. Migrations no Supabase + bucket `media`  
3. Inserir canal WhatsApp na tabela `channels`  
4. Webhook na Meta apontando para `https://monsterchat-xi.vercel.app/api/webhooks/whatsapp`  
5. Testar enviando uma mensagem pelo WhatsApp  

Depois disso, o fluxo de receber e responder mensagens no inbox estará ativo.
