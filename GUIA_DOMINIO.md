# 🌐 Guia: Usando seu Próprio Domínio para Webhooks

## 📋 Pré-requisitos

Para usar seu próprio domínio, você precisa:

1. ✅ Um domínio registrado (ex: `seudominio.com`)
2. ✅ Um servidor com IP público ou hospedagem (VPS, Cloud, etc.)
3. ✅ Certificado SSL/HTTPS (obrigatório para webhooks da Meta)
4. ✅ Acesso para configurar DNS e servidor

---

## 🚀 Opções de Deploy

### Opção 1: Deploy na Vercel (Recomendado para Frontend + API Routes)

A Vercel permite deploy fácil do Next.js e também suporta serverless functions.

#### Passos:

1. **Instale a Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Faça login:**
   ```bash
   vercel login
   ```

3. **Deploy do projeto:**
   ```bash
   vercel
   ```

4. **Configure seu domínio:**
   - No dashboard da Vercel, vá em **Settings > Domains**
   - Adicione seu domínio
   - Configure os registros DNS conforme instruções

5. **URL do webhook será:**
   ```
   https://seudominio.com/webhooks/whatsapp
   ```

---

### Opção 2: Deploy no Railway (Recomendado para Backend)

Railway é excelente para APIs Node.js.

#### Passos:

1. **Crie conta em:** https://railway.app

2. **Conecte seu repositório GitHub**

3. **Configure o projeto:**
   - Selecione o diretório `apps/api`
   - Railway detectará automaticamente Node.js

4. **Configure variáveis de ambiente:**
   - No dashboard do Railway, vá em **Variables**
   - Adicione todas as variáveis do `.env`

5. **Configure domínio personalizado:**
   - Vá em **Settings > Networking**
   - Clique em **Generate Domain** ou adicione seu domínio customizado
   - Configure DNS conforme instruções

6. **URL do webhook será:**
   ```
   https://api.seudominio.com/webhooks/whatsapp
   ```
   ou
   ```
   https://seudominio.com/webhooks/whatsapp
   ```

---

### Opção 3: Deploy no Render

Render oferece deploy gratuito e fácil.

#### Passos:

1. **Crie conta em:** https://render.com

2. **Crie novo Web Service:**
   - Conecte seu repositório GitHub
   - Selecione o diretório `apps/api`
   - Build Command: `cd apps/api && npm install && npm run build`
   - Start Command: `cd apps/api && npm start`

3. **Configure variáveis de ambiente:**
   - Vá em **Environment**
   - Adicione todas as variáveis do `.env`

4. **Configure domínio personalizado:**
   - Vá em **Settings**
   - Em **Custom Domain**, adicione seu domínio
   - Configure DNS conforme instruções

---

### Opção 4: VPS/Servidor Próprio (DigitalOcean, AWS, etc.)

Para controle total sobre o servidor.

#### Passos:

1. **Configure servidor:**
   ```bash
   # Instale Node.js
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Instale PM2 para gerenciar processos
   npm install -g pm2
   ```

2. **Configure Nginx como reverse proxy:**
   ```bash
   sudo apt install nginx
   ```

3. **Configure SSL com Let's Encrypt:**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d seudominio.com
   ```

4. **Configure Nginx:**
   Crie arquivo `/etc/nginx/sites-available/seudominio.com`:
   ```nginx
   server {
       listen 80;
       server_name seudominio.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name seudominio.com;

       ssl_certificate /etc/letsencrypt/live/seudominio.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/seudominio.com/privkey.pem;

       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

5. **Ative o site:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/seudominio.com /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

6. **Deploy da aplicação:**
   ```bash
   cd /var/www/seudominio
   git clone seu-repositorio .
   cd apps/api
   npm install
   npm run build
   pm2 start dist/app.js --name monsterchat-api
   pm2 save
   ```

---

## 🔧 Configuração do DNS

Independente da opção escolhida, você precisará configurar DNS:

### Para domínio raiz (seudominio.com):

**Registro A:**
```
Tipo: A
Nome: @
Valor: IP_DO_SERVIDOR (ou IP fornecido pela plataforma)
TTL: 3600
```

**Registro CNAME (se usar subdomínio):**
```
Tipo: CNAME
Nome: api
Valor: seudominio.railway.app (ou domínio fornecido pela plataforma)
TTL: 3600
```

### Para subdomínio (api.seudominio.com):

**Registro CNAME:**
```
Tipo: CNAME
Nome: api
Valor: seudominio.railway.app (ou domínio fornecido pela plataforma)
TTL: 3600
```

---

## 📝 Atualizando Variáveis de Ambiente

Após configurar o domínio, atualize o arquivo `.env`:

```env
# URL do frontend (se usar domínio próprio)
FRONTEND_URL=https://seudominio.com

# URL da API (se usar domínio próprio)
API_URL=https://api.seudominio.com
# ou
API_URL=https://seudominio.com
```

---

## ✅ Configurando Webhook na Meta

1. Acesse: **Meta for Developers > Configuração > Webhooks**

2. **URL de callback:**
   ```
   https://seudominio.com/webhooks/whatsapp
   ```
   ou
   ```
   https://api.seudominio.com/webhooks/whatsapp
   ```

3. **Verificar token:**
   ```
   (o mesmo valor do META_WEBHOOK_VERIFY_TOKEN no .env)
   ```

4. Clique em **"Verificar e salvar"**

---

## 🔍 Verificando se Está Funcionando

1. **Teste o endpoint manualmente:**
   ```bash
   curl https://seudominio.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=teste
   ```
   
   Deve retornar: `teste`

2. **Verifique os logs do servidor:**
   - Railway: Dashboard > Deployments > Logs
   - Render: Dashboard > Logs
   - VPS: `pm2 logs monsterchat-api`

3. **Envie uma mensagem de teste pelo WhatsApp**

---

## ⚠️ Importante

- ✅ **HTTPS é obrigatório** - A Meta não aceita webhooks HTTP
- ✅ **Porta 443** deve estar aberta no firewall
- ✅ **Certificado SSL válido** é necessário
- ✅ Aguarde propagação DNS (pode levar até 48h, geralmente é rápido)

---

## 🎯 Recomendação

Para começar rápido:
- **Frontend:** Vercel (deploy automático do Next.js)
- **Backend:** Railway ou Render (deploy fácil da API)

Ambos oferecem:
- ✅ HTTPS automático
- ✅ Domínio gratuito (ou customizado)
- ✅ Deploy automático via GitHub
- ✅ Escalabilidade automática
