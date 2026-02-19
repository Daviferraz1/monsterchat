# Guia de Configuração - MonsterChat

## 📋 Passo a Passo para Configurar o WhatsApp

### 1. Criar arquivo `.env` na raiz do projeto

Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

### 2. Preencher dados do WhatsApp (da página da Meta)

Com base na imagem que você compartilhou, preencha no arquivo `.env`:

```env
# Identificação do número de telefone (da imagem)
WHATSAPP_PHONE_NUMBER_ID=247994065074259

# Identificação da conta do WhatsApp Business (da imagem)
WHATSAPP_WABA_ID=285585611312219

# Token de acesso - GERAR na página da Meta e colar aqui
WHATSAPP_ACCESS_TOKEN=SEU_TOKEN_AQUI
```

**Como gerar o Token de Acesso:**
1. Na página da Meta que você está vendo, clique no botão **"Gerar token de acesso"**
2. Selecione sua conta do WhatsApp Business
3. Copie o token gerado
4. Cole no arquivo `.env` na variável `WHATSAPP_ACCESS_TOKEN`

### 3. Configurar App Secret e Webhook Verify Token

#### App Secret (META_APP_SECRET):
1. No Meta for Developers, vá em **Configurações > Básico**
2. Encontre o campo **"Segredo do app"**
3. Clique em **"Mostrar"** e copie o valor
4. Cole no arquivo `.env` na variável `META_APP_SECRET`

#### Webhook Verify Token (META_WEBHOOK_VERIFY_TOKEN):
1. Crie um token personalizado (ex: `meu_token_secreto_123`)
2. Cole no arquivo `.env` na variável `META_WEBHOOK_VERIFY_TOKEN`
3. **IMPORTANTE:** Você usará esse mesmo token ao configurar o webhook na Meta

### 4. Configurar Webhook na Meta

1. No Meta for Developers, vá em **Configuração da API > Webhooks**
2. Clique em **"Configurar webhooks"**
3. Preencha:
   - **URL do Callback:** `https://seu-dominio.com/webhooks/whatsapp` (ou use ngrok para desenvolvimento local)
   - **Token de verificação:** Use o mesmo valor de `META_WEBHOOK_VERIFY_TOKEN`
4. Selecione os eventos:
   - ✅ `messages`
   - ✅ `message_status`
5. Salve

### 5. Para desenvolvimento local (usando ngrok)

Se estiver testando localmente:

1. Instale o ngrok: https://ngrok.com/
2. Execute: `ngrok http 3001`
3. Use a URL do ngrok no webhook da Meta (ex: `https://abc123.ngrok.io/webhooks/whatsapp`)

### 6. Verificar se está funcionando

1. Inicie o servidor: `npm run dev` (na pasta `apps/api`)
2. Envie uma mensagem de teste pelo WhatsApp para seu número
3. Verifique os logs do servidor para ver se a mensagem foi recebida

## 📝 Exemplo de arquivo `.env` completo

```env
# Supabase (já preenchido)
SUPABASE_URL=https://kmsaanhbxgmlavffldlj.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Meta App
META_APP_SECRET=seu_app_secret_aqui
META_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123

# WhatsApp (da imagem)
WHATSAPP_PHONE_NUMBER_ID=247994065074259
WHATSAPP_ACCESS_TOKEN=token_gerado_na_pagina
WHATSAPP_WABA_ID=285585611312219

# App
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:3001
```

## ⚠️ Importante

- **NUNCA** commite o arquivo `.env` no Git (já está no `.gitignore`)
- O token de acesso do WhatsApp pode expirar - você precisará gerar um novo periodicamente
- Para produção, use tokens permanentes (System User Token)
