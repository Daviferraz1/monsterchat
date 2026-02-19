# 🔗 Guia de Configuração do Webhook - Meta WhatsApp

## 📋 O que preencher nos campos do Webhook

### 1️⃣ Campo: **URL de callback**

Este é o endereço onde a Meta enviará as notificações de mensagens recebidas.

#### Para Desenvolvimento Local (usando ngrok):

1. **Instale o ngrok:**
   - Baixe em: https://ngrok.com/download
   - Ou via npm: `npm install -g ngrok`

2. **Inicie seu servidor backend:**
   ```bash
   cd apps/api
   npm run dev
   ```
   O servidor estará rodando em `http://localhost:3001`

3. **Exponha o servidor com ngrok:**
   ```bash
   ngrok http 3001
   ```

4. **Copie a URL HTTPS gerada** (exemplo: `https://abc123.ngrok.io`)

5. **Complete a URL com o endpoint do webhook:**
   ```
   https://abc123.ngrok.io/webhooks/whatsapp
   ```
   
   ⚠️ **IMPORTANTE:** Use a URL HTTPS (não HTTP) e adicione `/webhooks/whatsapp` no final

6. **Cole essa URL completa no campo "URL de callback"**

#### Para Produção:

Use sua URL pública:
```
https://seu-dominio.com/webhooks/whatsapp
```

---

### 2️⃣ Campo: **Verificar token**

Este token é usado para validar que as requisições vêm realmente da Meta.

1. **Abra o arquivo `.env` na raiz do projeto**

2. **Encontre a variável `META_WEBHOOK_VERIFY_TOKEN`**

3. **Crie um token personalizado** (exemplo: `meu_token_secreto_123`)
   ```env
   META_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123
   ```

4. **Cole o MESMO token no campo "Verificar token" da Meta**

   ⚠️ **IMPORTANTE:** O token deve ser EXATAMENTE o mesmo nos dois lugares!

---

## 📝 Exemplo Completo

### No arquivo `.env`:
```env
META_WEBHOOK_VERIFY_TOKEN=meu_token_secreto_123
```

### Na configuração do Webhook da Meta:

**URL de callback:**
```
https://abc123.ngrok.io/webhooks/whatsapp
```

**Verificar token:**
```
meu_token_secreto_123
```

---

## ✅ Próximos Passos

1. Preencha os dois campos acima
2. Clique em **"Verificar e salvar"** ou **"Salvar"**
3. A Meta tentará fazer uma requisição GET para sua URL para verificar
4. Se tudo estiver correto, você verá uma mensagem de sucesso

---

## 🔍 Verificando se está funcionando

Após salvar o webhook:

1. Verifique os logs do seu servidor backend
2. Você deve ver uma requisição GET para `/webhooks/whatsapp` com parâmetros de verificação
3. Se a verificação passar, o webhook estará ativo

---

## ⚠️ Problemas Comuns

### Erro: "URL não acessível"
- Certifique-se de que o ngrok está rodando
- Verifique se a URL está correta (com `/webhooks/whatsapp`)
- Use HTTPS, não HTTP

### Erro: "Token de verificação inválido"
- Verifique se o token no `.env` é EXATAMENTE igual ao da Meta
- Reinicie o servidor após alterar o `.env`
- Não use espaços ou caracteres especiais no token

### Webhook não recebe mensagens
- Verifique se os campos do webhook estão assinados (marcados)
- Certifique-se de que o servidor está rodando
- Verifique os logs do servidor para erros

---

## 📚 Campos do Webhook para Assinar

Na seção "Campos do webhook", marque (assine) pelo menos:

- ✅ `messages` - Para receber mensagens
- ✅ `message_status` - Para receber atualizações de status (enviado, entregue, lido)

Esses são os campos essenciais para o funcionamento básico do sistema.
