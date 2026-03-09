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
   | `API_URL` | **URL pública da API** (Railway/Render) | Ex.: `https://monsterchat-api.railway.app` |
   | `NEXT_PUBLIC_API_URL` | **Mesmo valor de API_URL** | Para o navegador carregar o QR do Baileys |

4. **Webhooks da Meta** (WhatsApp/Instagram): na configuração do app na Meta, use a URL do **Vercel**, por exemplo:
   - `https://seu-app.vercel.app/api/webhooks/whatsapp`
   - (Não use a URL da API Railway/Render para esses webhooks; eles são tratados pelo Next.js no Vercel.)

5. Deploy: push no repositório ou deploy manual.

---

## 3. API (Express + Baileys) em Railway ou Render

A API **não** roda na Vercel. Use um serviço que mantém um processo Node sempre ativo.

### Opção A: Railway

1. Acesse [railway.app](https://railway.app) e crie um projeto.
2. **New → Deploy from GitHub repo** e escolha o repositório do MonsterChat.
3. Configuração do serviço:
   - **Root Directory:** `apps/api`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
   - **Watch Paths:** `apps/api` (opcional)
4. **Variables** (variáveis de ambiente):

   | Variável | Valor |
   |----------|--------|
   | `SUPABASE_URL` | Mesma URL do Supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | Mesma service role key |
   | `FRONTEND_URL` | URL do app na Vercel (ex.: `https://seu-app.vercel.app`) |
   | `PORT` | Railway/Render define automaticamente; use `process.env.PORT` (já usado no código) |
   | `NODE_ENV` | `production` |

   Se você também usar webhooks WhatsApp/Instagram **na API** (não no Vercel), adicione:
   - `META_APP_SECRET`
   - `META_WEBHOOK_VERIFY_TOKEN`
   - e as variáveis de WhatsApp/Instagram.

5. Gere um **domínio público** no Railway (Settings → Networking → Generate Domain). Ex.: `https://monsterchat-api.railway.app`.
6. Use essa URL em **API_URL** e **NEXT_PUBLIC_API_URL** no Vercel (passo 2).

### Opção B: Render

1. [render.com](https://render.com) → New → Web Service.
2. Conecte o repositório.
3. **Build:**
   - **Root Directory:** `apps/api`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run start`
4. **Environment:** adicione as mesmas variáveis do quadro acima (incluindo `FRONTEND_URL` = URL do Vercel).
5. Crie o serviço; Render gera uma URL (ex.: `https://monsterchat-api.onrender.com`).
6. Use essa URL em **API_URL** e **NEXT_PUBLIC_API_URL** no Vercel.

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
