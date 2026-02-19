# ⚡ Resumo Rápido: Deploy Supabase + Vercel

## 🎯 Stack Final

- ✅ **Frontend + Backend:** Vercel (Next.js com API Routes)
- ✅ **Banco de Dados:** Supabase (PostgreSQL + Realtime)
- ✅ **Storage:** Supabase Storage (para mídias)

---

## 📋 Checklist de Deploy

### 1. Supabase (5 min)
- [ ] Criar projeto no Supabase
- [ ] Rodar migrations: `supabase db push`
- [ ] Criar bucket `media` no Storage
- [ ] Copiar credenciais (URL, anon key, service_role key)

### 2. Vercel (5 min)
- [ ] Conectar repositório GitHub
- [ ] Configurar Root Directory: `apps/web`
- [ ] Adicionar variáveis de ambiente (veja `.env.example`)
- [ ] Deploy

### 3. Meta Webhook (2 min)
- [ ] URL: `https://seu-projeto.vercel.app/api/webhooks/whatsapp`
- [ ] Token: (mesmo do `META_WEBHOOK_VERIFY_TOKEN`)
- [ ] Marcar: `messages` e `message_status`

---

## 🔑 Variáveis de Ambiente no Vercel

### Públicas (NEXT_PUBLIC_*):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Privadas (apenas servidor):
```
SUPABASE_SERVICE_ROLE_KEY
META_APP_SECRET
META_WEBHOOK_VERIFY_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_ACCESS_TOKEN
WHATSAPP_WABA_ID
```

---

## ✅ Testar

1. **Health check:**
   ```bash
   curl https://seu-projeto.vercel.app/api/health
   ```

2. **Webhook:**
   ```bash
   curl "https://seu-projeto.vercel.app/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=teste"
   ```

3. **Enviar mensagem de teste pelo WhatsApp**

---

## 📚 Documentação Completa

- **Guia Completo:** `GUIA_SUPABASE_VERCEL.md`
- **Configuração WhatsApp:** `GUIA_CONFIGURACAO.md`
- **Webhook:** `GUIA_WEBHOOK.md`

---

## 🎉 Pronto!

Seu MonsterChat está no ar! 🚀
