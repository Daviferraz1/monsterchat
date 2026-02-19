# 🚀 Guia de Deploy na Vercel - MonsterChat

## 📋 Visão Geral

A Vercel é perfeita para o frontend Next.js. Para o backend, temos duas opções:

1. **Opção A (Recomendada):** Deploy do backend separado na Railway/Render
2. **Opção B:** Usar Vercel Serverless Functions (requer adaptação)

Vamos com a **Opção A** que é mais simples e não requer mudanças no código.

---

## 🎯 Passo 1: Deploy do Frontend (Next.js) na Vercel

### 1.1 Preparação

1. **Certifique-se de que o projeto está no GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/seu-usuario/monsterchat.git
   git push -u origin main
   ```

### 1.2 Deploy na Vercel

1. **Acesse:** https://vercel.com
2. **Faça login** com sua conta GitHub
3. **Clique em "Add New Project"**
4. **Importe seu repositório** do GitHub
5. **Configure o projeto:**
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`
   - **Build Command:** `npm run build` (ou deixe padrão)
   - **Output Directory:** `.next` (ou deixe padrão)
   - **Install Command:** `npm install`

6. **Configure Variáveis de Ambiente:**
   Clique em "Environment Variables" e adicione:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://kmsaanhbxgmlavffldlj.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imttc2FhbmhieGdtbGF2ZmZsZGxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDM0MzQsImV4cCI6MjA4NzA3OTQzNH0.3I7ekFbTH-WD7EVbGRS_laCP0frXVI0aQOoaPT3jdTw
   NEXT_PUBLIC_API_URL=https://seu-backend.railway.app
   ```
   ⚠️ **IMPORTANTE:** Substitua `seu-backend.railway.app` pela URL do seu backend (veja Passo 2)

7. **Clique em "Deploy"**

8. **Aguarde o deploy** (geralmente 2-3 minutos)

9. **Sua aplicação estará em:**
   ```
   https://monsterchat.vercel.app
   ```

---

## 🔧 Passo 2: Deploy do Backend (API) na Railway

Como a Vercel é otimizada para frontend, vamos usar Railway para o backend.

### 2.1 Criar conta no Railway

1. **Acesse:** https://railway.app
2. **Faça login** com GitHub
3. **Clique em "New Project"**
4. **Selecione "Deploy from GitHub repo"**
5. **Escolha seu repositório**

### 2.2 Configurar o Projeto

1. **Clique no projeto criado**
2. **Clique em "Settings"**
3. **Em "Root Directory"**, configure:
   ```
   apps/api
   ```

4. **Configure o Build:**
   - Railway detectará automaticamente Node.js
   - Ou configure manualmente:
     - **Build Command:** `npm install && npm run build`
     - **Start Command:** `npm start`

### 2.3 Configurar Variáveis de Ambiente

No Railway, vá em **Variables** e adicione todas as variáveis do seu `.env`:

```env
# Supabase
SUPABASE_URL=https://kmsaanhbxgmlavffldlj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imttc2FhbmhieGdtbGF2ZmZsZGxqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTUwMzQzNCwiZXhwIjoyMDg3MDc5NDM0fQ.wTMVEMemxA1eIQnGhhVcQLhzdbntvRtTQlKr3aEIfro

# Meta App
META_APP_SECRET=seu_app_secret
META_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=247994065074259
WHATSAPP_ACCESS_TOKEN=seu_token_aqui
WHATSAPP_WABA_ID=285585611312219

# App
PORT=3001
NODE_ENV=production
FRONTEND_URL=https://monsterchat.vercel.app
API_URL=https://seu-backend.railway.app
```

### 2.4 Obter URL do Backend

1. **No Railway, vá em "Settings" > "Networking"**
2. **Clique em "Generate Domain"** (se ainda não tiver)
3. **Copie a URL gerada** (exemplo: `monsterchat-api-production.up.railway.app`)

### 2.5 Atualizar Variáveis no Frontend

1. **Volte para Vercel**
2. **Vá em Settings > Environment Variables**
3. **Atualize `NEXT_PUBLIC_API_URL`:**
   ```
   NEXT_PUBLIC_API_URL=https://monsterchat-api-production.up.railway.app
   ```
4. **Redeploy** o frontend (ou aguarde o redeploy automático)

---

## 🌐 Passo 3: Configurar Domínio Personalizado

### 3.1 Configurar Domínio no Railway (Backend)

1. **No Railway, vá em Settings > Networking**
2. **Clique em "Custom Domain"**
3. **Adicione seu domínio:** `api.seudominio.com`
4. **Configure DNS:**
   - Tipo: `CNAME`
   - Nome: `api`
   - Valor: `monsterchat-api-production.up.railway.app`
   - TTL: `3600`

5. **Aguarde propagação DNS** (pode levar alguns minutos)

### 3.2 Configurar Domínio no Vercel (Frontend)

1. **No Vercel, vá em Settings > Domains**
2. **Adicione seu domínio:** `seudominio.com`
3. **Configure DNS conforme instruções da Vercel:**
   - Geralmente um registro `A` ou `CNAME`
   - A Vercel fornecerá os valores exatos

4. **Aguarde propagação DNS**

### 3.3 Atualizar Variáveis de Ambiente

Após configurar os domínios, atualize:

**No Railway (Backend):**
```env
FRONTEND_URL=https://seudominio.com
API_URL=https://api.seudominio.com
```

**No Vercel (Frontend):**
```env
NEXT_PUBLIC_API_URL=https://api.seudominio.com
```

---

## 🔗 Passo 4: Configurar Webhook na Meta

Agora que seu backend está rodando, configure o webhook:

1. **Acesse:** Meta for Developers > Configuração > Webhooks

2. **URL de callback:**
   ```
   https://api.seudominio.com/webhooks/whatsapp
   ```
   ou (se não configurou domínio customizado):
   ```
   https://monsterchat-api-production.up.railway.app/webhooks/whatsapp
   ```

3. **Verificar token:**
   ```
   (o mesmo valor do META_WEBHOOK_VERIFY_TOKEN no Railway)
   ```

4. **Clique em "Verificar e salvar"**

5. **Marque os campos:**
   - ✅ `messages`
   - ✅ `message_status`

---

## ✅ Verificando se Está Funcionando

### Teste 1: Verificar Backend

```bash
curl https://api.seudominio.com/health
```

Deve retornar:
```json
{"status":"ok","timestamp":"..."}
```

### Teste 2: Verificar Webhook

```bash
curl "https://api.seudominio.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=teste"
```

Deve retornar: `teste`

### Teste 3: Verificar Frontend

Acesse: `https://seudominio.com`

Deve carregar a aplicação normalmente.

---

## 📝 Arquivo vercel.json (Opcional)

Se quiser configurar o projeto diretamente, crie `apps/web/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase_url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase_anon_key",
    "NEXT_PUBLIC_API_URL": "@api_url"
  }
}
```

Mas é melhor configurar via dashboard da Vercel.

---

## 🔄 Deploy Automático

Ambos Vercel e Railway fazem deploy automático quando você faz push para o GitHub:

1. **Faça alterações no código**
2. **Commit e push:**
   ```bash
   git add .
   git commit -m "Minhas alterações"
   git push
   ```
3. **Deploy automático acontece** em ambos os serviços

---

## 🐛 Troubleshooting

### Backend não inicia no Railway

- Verifique se o `Root Directory` está como `apps/api`
- Verifique se o `Start Command` está correto: `npm start`
- Verifique os logs no Railway Dashboard

### Frontend não conecta ao backend

- Verifique se `NEXT_PUBLIC_API_URL` está correto
- Verifique CORS no backend (já configurado para aceitar do frontend)
- Verifique se o backend está rodando (teste `/health`)

### Webhook não funciona

- Verifique se a URL está acessível publicamente
- Verifique se está usando HTTPS (não HTTP)
- Verifique se o token de verificação está correto
- Verifique os logs do Railway para erros

---

## 📚 Próximos Passos

1. ✅ Deploy do frontend na Vercel
2. ✅ Deploy do backend no Railway
3. ✅ Configurar domínios
4. ✅ Configurar webhook na Meta
5. ✅ Testar envio e recebimento de mensagens

Seu sistema MonsterChat estará funcionando em produção! 🎉
