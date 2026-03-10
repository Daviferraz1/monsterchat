# Deploy em produção (Vercel + Supabase + API)

O MonsterChat usa:

- **Vercel** → frontend (Next.js) e API Routes (webhooks WhatsApp/Instagram da Meta, envio de mensagens).
- **Supabase** → banco de dados e auth.
- **Serviço extra (Railway / Render / etc.)** → API Express com **Baileys** (canal WhatsApp por QR). A Vercel não roda processo contínuo, então o Baileys **precisa** de um servidor sempre ligado.

---

## 1. Supabase (já em uso)

- Projeto e variáveis já configurados.
- Em produção, use as mesmas variáveis (URL e chaves) no **Vercel** e na **API** (Railway/Render).

---

## 2. Vercel (frontend + serverless)

1. Conecte o repositório ao Vercel (monorepo: root do repo).
2. **Build settings:**
   - **Root Directory:** deixe em branco ou use a raiz.
   - **Framework Preset:** Next.js.
   - Se o app Next.js estiver em `apps/web`, defina **Root Directory** = `apps/web` (ou configure o build para esse diretório).
3. **Variáveis de ambiente** (Settings → Environment Variables):

   | Variável | Valor | Observação |
   |----------|--------|------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase | |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon do Supabase | |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key | |
   | `META_APP_SECRET` | Segredo do app Meta | Para webhooks WhatsApp/Instagram |
   | `META_WEBHOOK_VERIFY_TOKEN` | Token de verificação do webhook | |
   | `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID | Se usar WhatsApp API |
   | `WHATSAPP_ACCESS_TOKEN` | Token do WhatsApp | |
   | `WHATSAPP_WABA_ID` | WABA ID | Opcional |
   | `API_URL` | **URL pública da API** (Railway/Render) | Ex.: `https://monsterchat-api.onrender.com` |
   | `NEXT_PUBLIC_API_URL` | **Mesmo valor de API_URL** | Para o navegador carregar o QR do Baileys |

4. **Domínio customizado (ex.: chatmonster.monsterconcursos.com.br)**  
   - Em **Settings → Domains** do projeto na Vercel, adicione o domínio (ex.: `chatmonster.monsterconcursos.com.br`).
   - No seu provedor de DNS (onde está o domínio `monsterconcursos.com.br`), crie um **CNAME** para `chatmonster` apontando para `cname.vercel-dns.com` (ou o valor que a Vercel indicar).
   - Depois que o domínio estiver ativo, use **essa URL** como origem do app. No Render (API), defina **`FRONTEND_URL`** = `https://chatmonster.monsterconcursos.com.br` (sem barra no final). Para aceitar mais de uma origem (ex.: domínio custom + URL padrão da Vercel), use vírgula: `https://chatmonster.monsterconcursos.com.br,https://monsterchat-xi.vercel.app`.

5. **Webhooks da Meta** (WhatsApp/Instagram): na configuração do app na Meta, use a URL do **Vercel**, por exemplo:
   - `https://seu-app.vercel.app/api/webhooks/whatsapp`
   - (Não use a URL da API Railway/Render para esses webhooks; eles são tratados pelo Next.js no Vercel.)

6. Deploy: push no repositório ou deploy manual.

---

## 3. API (Express + Baileys) em Render (recomendado) ou Railway

A API **não** roda na Vercel. Use um serviço que mantém um processo Node sempre ativo. **A API usa npm (não yarn).**

### Opção A: Render

1. [render.com](https://render.com) → **New → Web Service**.
2. Conecte o repositório do MonsterChat (GitHub).
3. Preencha assim:
   - **Name:** `monsterchat` (ou outro nome, ex.: `monsterchat-api`)
   - **Region:** escolha a mesma do seu app web se tiver (ex.: Oregon).
   - **Root Directory:** `apps/api` ← obrigatório (monorepo).
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start` ← use **npm**, não yarn.
4. **Environment Variables** (Environment → Add Environment Variable):
   - `SUPABASE_URL` = URL do seu projeto Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` = service role key do Supabase
   - `FRONTEND_URL` = URL do front (ex.: `https://chatmonster.monsterconcursos.com.br` ou várias separadas por vírgula) — para CORS
   - `NODE_ENV` = `production`
   - (O `PORT` o Render define automaticamente; o código já usa `process.env.PORT`.)

   Se for usar webhooks WhatsApp/Instagram **na API** (em vez do Vercel), adicione também:
   - `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` e as variáveis de WhatsApp/Instagram.
5. **Node:** o projeto pede Node 20+ (Baileys/Supabase). O Render costuma respeitar o `engines.node` e o `.nvmrc` em `apps/api`. Se o build falhar pedindo Node 20, em **Environment** adicione `NODE_VERSION` = `20`.
6. Clique em **Create Web Service**. O Render gera uma URL (ex.: `https://monsterchat-api.onrender.com`).
7. Use essa URL em **API_URL** e **NEXT_PUBLIC_API_URL** no Vercel (passo 2).

### Opção B: Railway

1. [railway.app](https://railway.app) → New → Deploy from GitHub repo.
2. **Root Directory:** `apps/api` | **Build:** `npm install && npm run build` | **Start:** `npm run start`
3. **Variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`, `NODE_ENV=production`. Se o build usar Node 18, adicione `NIXPACKS_NODE_VERSION` = `20`.
4. Gere domínio em Settings → Networking e use essa URL no Vercel em API_URL / NEXT_PUBLIC_API_URL.

### Persistência das sessões Baileys (Railway/Render)

- As credenciais do Baileys são salvas em `sessions/baileys/{channelId}` no **disco local** do container.
- Em Railway/Render o disco é **efêmero**: ao reiniciar o serviço, a sessão é perdida e será preciso **escanear o QR de novo**.
- Para manter sessão entre deploys/restarts, seria preciso persistir em banco ou storage (implementação futura). Por enquanto, após cada deploy ou restart da API, abra Configurações → Canais → canal WhatsApp (QR) e escaneie o QR novamente.

---

## 4. Resumo rápido

| Onde | O que |
|------|--------|
| **Vercel** | Frontend Next.js + API Routes (webhooks Meta, envio WhatsApp API/Instagram). Variáveis Supabase + Meta + **API_URL** / **NEXT_PUBLIC_API_URL** = URL da API. |
| **Supabase** | Banco e auth (já configurado). |
| **Railway ou Render** | API Express (Baileys). Variáveis: Supabase + **FRONTEND_URL** = URL do Vercel. Domínio público → colar em API_URL no Vercel. |

Depois do deploy:

1. No Vercel: webhooks da Meta apontando para `https://seu-app.vercel.app/api/webhooks/whatsapp` (e Instagram, se usar).
2. No app (Vercel): Configurações → Canais. Para **WhatsApp (QR / Baileys)**, cadastre o canal e clique no ícone de QR; o QR vem da API (Railway/Render). Se der “conexão recusada”, confira **NEXT_PUBLIC_API_URL** e se a API está no ar e com **FRONTEND_URL** igual à URL do Vercel (CORS).
