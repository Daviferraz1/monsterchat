# 🚀 Guia Completo: Deploy MonsterChat com Supabase + Vercel

## 📋 Visão Geral

Este guia mostra como fazer deploy completo do MonsterChat usando:
- **Frontend + Backend:** Vercel (Next.js com API Routes)
- **Banco de Dados:** Supabase (PostgreSQL + Realtime + Storage)
- **Webhooks:** Meta WhatsApp e Instagram

---

## ✅ Pré-requisitos

1. ✅ Conta no Supabase: https://supabase.com
2. ✅ Conta na Vercel: https://vercel.com
3. ✅ Conta no Meta for Developers: https://developers.facebook.com
4. ✅ Repositório no GitHub

---

## 📦 Passo 1: Configurar Supabase

### 1.1 Criar Projeto no Supabase

1. Acesse: https://supabase.com/dashboard
2. Clique em **"New Project"**
3. Preencha:
   - **Name:** MonsterChat
   - **Database Password:** (anote essa senha!)
   - **Region:** Escolha a mais próxima
4. Aguarde criação (2-3 minutos)

### 1.2 Rodar Migrations

1. **Instale Supabase CLI:**
   ```bash
   npm install -g supabase
   ```

2. **Faça login:**
   ```bash
   supabase login
   ```

3. **Link seu projeto:**
   ```bash
   cd supabase
   supabase link --project-ref seu-project-ref
   ```
   (Encontre o project-ref em: Supabase Dashboard > Settings > General > Reference ID)

4. **Rode as migrations:**
   ```bash
   supabase db push
   ```

### 1.3 Criar Bucket de Storage

1. No Supabase Dashboard, vá em **Storage**
2. Clique em **"New bucket"**
3. Nome: `media`
4. Marque **"Public bucket"**
5. Clique em **"Create bucket"**

### 1.4 Obter Credenciais

No Supabase Dashboard > Settings > API:

- ✅ **Project URL** → `SUPABASE_URL`
- ✅ **anon public** key → `SUPABASE_ANON_KEY`
- ✅ **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ SECRETO!)

---

## 🚀 Passo 2: Deploy na Vercel

### 2.1 Preparar Repositório

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/seu-usuario/monsterchat.git
git push -u origin main
```

### 2.2 Deploy na Vercel

1. **Acesse:** https://vercel.com/new
2. **Login com GitHub**
3. **Importe seu repositório**
4. **Configure:**
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web` ⚠️ IMPORTANTE
   - **Build Command:** `npm run build` (padrão)
   - **Output Directory:** `.next` (padrão)
   - **Install Command:** `npm install`

### 2.3 Configurar Variáveis de Ambiente

No Vercel, vá em **Settings > Environment Variables** e adicione:

#### Variáveis Públicas (NEXT_PUBLIC_*):
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
NEXT_PUBLIC_API_URL=https://seu-projeto.vercel.app
```

#### Variáveis Privadas (Backend/API Routes):
```env
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
META_APP_SECRET=seu-app-secret
META_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123
WHATSAPP_PHONE_NUMBER_ID=247994065074259
WHATSAPP_ACCESS_TOKEN=seu-token-aqui
WHATSAPP_WABA_ID=285585611312219
```

⚠️ **IMPORTANTE:** 
- Variáveis `NEXT_PUBLIC_*` são expostas no cliente
- Variáveis sem `NEXT_PUBLIC_` são apenas no servidor (API Routes)

### 2.4 Deploy

1. Clique em **"Deploy"**
2. Aguarde 2-3 minutos
3. Sua aplicação estará em: `https://monsterchat.vercel.app`

---

## 🔗 Passo 3: Configurar Webhook na Meta

### 3.1 Obter URL do Webhook

Sua URL será:
```
https://seu-projeto.vercel.app/api/webhooks/whatsapp
```

### 3.2 Configurar na Meta

1. Acesse: Meta for Developers > Seu App > **Configuração > Webhooks**
2. **URL de callback:**
   ```
   https://seu-projeto.vercel.app/api/webhooks/whatsapp
   ```
3. **Verificar token:**
   ```
   (mesmo valor de META_WEBHOOK_VERIFY_TOKEN)
   ```
4. Clique em **"Verificar e salvar"**
5. Marque os campos:
   - ✅ `messages`
   - ✅ `message_status`

---

## ✅ Passo 4: Verificar Funcionamento

### 4.1 Testar Webhook

```bash
curl "https://seu-projeto.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=teste"
```

Deve retornar: `teste`

### 4.2 Testar Health Check

```bash
curl https://seu-projeto.vercel.app/api/health
```

Deve retornar:
```json
{"status":"ok","timestamp":"..."}
```

### 4.3 Enviar Mensagem de Teste

Envie uma mensagem do WhatsApp para seu número de teste e verifique:
- ✅ Mensagem aparece no dashboard
- ✅ Realtime funciona (atualização instantânea)

---

## 🌐 Passo 5: Configurar Domínio Personalizado (Opcional)

### 5.1 Adicionar Domínio na Vercel

1. Vercel Dashboard > **Settings > Domains**
2. Adicione seu domínio: `seudominio.com`
3. Configure DNS conforme instruções da Vercel

### 5.2 Atualizar Webhook

Atualize a URL do webhook na Meta:
```
https://seudominio.com/api/webhooks/whatsapp
```

---

## 📝 Estrutura de Arquivos Importante

```
apps/web/
├── src/
│   ├── app/
│   │   ├── api/                    # API Routes (Serverless Functions)
│   │   │   ├── webhooks/
│   │   │   │   ├── whatsapp/route.ts
│   │   │   │   └── instagram/route.ts
│   │   │   ├── messages/route.ts
│   │   │   └── conversations/route.ts
│   │   └── (dashboard)/            # Frontend
│   └── lib/
│       └── api/                    # Serviços e utilitários do backend
│           ├── env.ts
│           ├── supabase.ts
│           ├── services/
│           └── webhooks/
```

---

## 🔧 Troubleshooting

### Erro: "Missing environment variable"

- Verifique se todas as variáveis estão configuradas no Vercel
- Certifique-se de que variáveis privadas NÃO têm `NEXT_PUBLIC_`
- Redeploy após adicionar variáveis

### Webhook não funciona

- Verifique se URL está acessível publicamente
- Use HTTPS (não HTTP)
- Verifique se token de verificação está correto
- Veja logs no Vercel Dashboard > Deployments > Functions

### Realtime não funciona

- Verifique se Realtime está habilitado no Supabase
- Verifique se migrations foram rodadas corretamente
- Verifique se `NEXT_PUBLIC_SUPABASE_URL` está correto

### Erro de CORS

- CORS já está configurado automaticamente no Next.js
- Se persistir, verifique se está usando a URL correta

---

## 📚 Próximos Passos

1. ✅ Configure autenticação de usuários
2. ✅ Adicione mais recursos (quick replies, notas internas)
3. ✅ Configure notificações
4. ✅ Adicione analytics

---

## 🎉 Pronto!

Seu MonsterChat está rodando em produção com:
- ✅ Frontend e Backend na Vercel
- ✅ Banco de dados no Supabase
- ✅ Webhooks funcionando
- ✅ Realtime ativo

Aproveite! 🚀
