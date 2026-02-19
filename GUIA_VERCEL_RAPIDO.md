# ⚡ Guia Rápido: Deploy na Vercel

## 🎯 Estratégia Recomendada

- **Frontend (Next.js):** Vercel ✅
- **Backend (API):** Railway ou Render ✅

---

## 📦 Passo 1: Deploy do Frontend na Vercel (5 minutos)

### 1. Preparar repositório no GitHub

```bash
# Se ainda não fez commit
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/seu-usuario/monsterchat.git
git push -u origin main
```

### 2. Deploy na Vercel

1. Acesse: https://vercel.com/new
2. Faça login com GitHub
3. Importe seu repositório
4. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web` ⚠️ IMPORTANTE
   - Deixe o resto padrão

5. **Adicione Variáveis de Ambiente:**
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://kmsaanhbxgmlavffldlj.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - `NEXT_PUBLIC_API_URL` = `https://seu-backend.railway.app` (atualize depois)

6. Clique em **Deploy**

✅ Frontend pronto em: `https://monsterchat.vercel.app`

---

## 🔧 Passo 2: Deploy do Backend no Railway (5 minutos)

### 1. Criar projeto no Railway

1. Acesse: https://railway.app/new
2. Login com GitHub
3. **Deploy from GitHub repo**
4. Selecione seu repositório

### 2. Configurar

1. Clique no projeto → **Settings**
2. **Root Directory:** `apps/api`
3. **Variables** → Adicione todas do `.env`:
   ```env
   SUPABASE_URL=https://kmsaanhbxgmlavffldlj.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   META_APP_SECRET=seu_app_secret
   META_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123
   WHATSAPP_PHONE_NUMBER_ID=247994065074259
   WHATSAPP_ACCESS_TOKEN=seu_token
   WHATSAPP_WABA_ID=285585611312219
   PORT=3001
   NODE_ENV=production
   FRONTEND_URL=https://monsterchat.vercel.app
   ```

### 3. Obter URL

1. **Settings** → **Networking**
2. **Generate Domain** (se necessário)
3. Copie a URL: `monsterchat-api-production.up.railway.app`

### 4. Atualizar Frontend

1. Volte para Vercel
2. **Settings** → **Environment Variables**
3. Atualize `NEXT_PUBLIC_API_URL` = URL do Railway
4. Redeploy automático acontece

✅ Backend pronto!

---

## 🌐 Passo 3: Domínio Personalizado (Opcional)

### Backend (Railway)

1. Railway → **Settings** → **Networking**
2. **Custom Domain** → `api.seudominio.com`
3. Configure DNS: CNAME → `api` → URL do Railway

### Frontend (Vercel)

1. Vercel → **Settings** → **Domains**
2. Adicione: `seudominio.com`
3. Configure DNS conforme instruções da Vercel

---

## 🔗 Passo 4: Configurar Webhook na Meta

1. Meta for Developers → **Configuração** → **Webhooks**
2. **URL de callback:**
   ```
   https://monsterchat-api-production.up.railway.app/webhooks/whatsapp
   ```
   ou (se tiver domínio):
   ```
   https://api.seudominio.com/webhooks/whatsapp
   ```
3. **Verificar token:** (mesmo do `.env`)
4. Marque: `messages` e `message_status`
5. Salve

✅ Pronto!

---

## ✅ Checklist Final

- [ ] Frontend deployado na Vercel
- [ ] Backend deployado no Railway
- [ ] Variáveis de ambiente configuradas
- [ ] `NEXT_PUBLIC_API_URL` apontando para Railway
- [ ] Webhook configurado na Meta
- [ ] Teste: Acesse `https://monsterchat.vercel.app`

---

## 🐛 Problemas Comuns

**Frontend não conecta ao backend:**
- Verifique `NEXT_PUBLIC_API_URL` na Vercel
- Verifique CORS no backend (já configurado)

**Backend não inicia:**
- Verifique `Root Directory` = `apps/api` no Railway
- Verifique variáveis de ambiente

**Webhook não funciona:**
- Use HTTPS (não HTTP)
- Verifique se backend está acessível publicamente
- Teste: `curl https://seu-backend.railway.app/health`

---

## 📚 Próximos Passos

1. Configure domínio personalizado (opcional)
2. Teste envio/recebimento de mensagens
3. Configure notificações
4. Adicione mais recursos!

🎉 Seu MonsterChat está no ar!
