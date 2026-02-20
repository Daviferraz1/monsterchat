# Checklist: Testes para aprovar o app na Meta (WhatsApp / Business)

Este guia ajuda a completar **todos os testes de API** que a Meta exige para aprovar seu app (tela "Conectar-se com clientes pelo WhatsApp" → Teste em andamento).

---

## Status por permissão

| Permissão | Status no painel | O que fazer |
|-----------|------------------|-------------|
| `whatsapp_business_messaging` | ✅ Concluída | Já aprovada — envio de mensagens está em uso. |
| `whatsapp_business_management` | ✅ Concluída | Já aprovada — gestão da conta/números em uso. |
| `whatsapp_business_manage_events` | 0 chamada(s) | Disparar chamada à API de webhooks (subscribed_apps). |
| `manage_app_solution` | 0 de 1 obrigatória | Fazer 1 chamada que use esta permissão (ver abaixo). |
| `business_management` | 0 de 1 obrigatória | Fazer 1 chamada `GET me/businesses`. |
| `email` | 0 chamada(s) | Só precisa se o app usa "Login com Facebook" e pede email. |
| `public_profile` | 0 chamada(s) | Só precisa se o app usa "Login com Facebook" e pede perfil. |

---

## 1. Chamadas que o MonsterChat já pode disparar

### 1.1 `business_management` (obrigatória)

- **Chamada:** `GET https://graph.facebook.com/v21.0/me/businesses`
- **Token:** Use o mesmo token do WhatsApp (System User ou User token com permissão `business_management`).

**Opção A – Pelo app (recomendado):**  
Abra no navegador (com o app rodando e canal WhatsApp configurado):

```
https://SEU_DOMINIO/api/meta/test-permissions
```

Essa rota chama `me/businesses` e `{waba}/subscribed_apps` e retorna o resultado. Assim a Meta registra a chamada.

**Opção B – Graph API Explorer:**  
1. Acesse [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer).  
2. Selecione seu app.  
3. Em "Permissões do usuário", marque `business_management`.  
4. Gere um User Access Token.  
5. No campo "Endpoint", use: `me/businesses`.  
6. Clique em "Enviar" (Submit).

---

### 1.2 `whatsapp_business_manage_events` (eventos/webhooks)

- **Chamada:** `GET https://graph.facebook.com/v21.0/{WABA_ID}/subscribed_apps`  
  (ou `POST` para (re)subscrever o app aos eventos)
- **Token:** Token do canal WhatsApp (com `whatsapp_business_management` / `whatsapp_business_manage_events`).

**Pelo app:**  
A mesma rota `/api/meta/test-permissions` faz essa chamada se você tiver um canal WhatsApp com **WABA ID** (ID da conta Business) preenchido em Configurações → Canais.

**Pelo Graph API Explorer:**  
1. Endpoint: `{WABA_ID}/subscribed_apps` (substitua pelo seu ID da conta WhatsApp Business).  
2. Token com permissões WhatsApp.  
3. Enviar.

---

### 1.3 `manage_app_solution` (obrigatória – 1 chamada)

A Meta não documenta um endpoint único para essa permissão. Em geral ela está ligada a:

- Gestão de **Solution Provider** / **Multi-Partner Solution**, ou  
- Chamadas ao **Application** (ex.: dados do app).

**Sugestão:**  
1. No [Graph API Explorer](https://developers.facebook.com/tools/explorer), selecione seu app e adicione a permissão `manage_app_solution`.  
2. Gere o token.  
3. Teste um destes endpoints (conforme a documentação atual da Meta):
   - `me?fields=id,name`
   - `app?fields=id,name`
   - Ou o endpoint indicado na tela de permissões do app (App Review → sua permissão → "Como testar").

Se na tela da Meta aparecer um link "Como testar" ou "Required API call", use exatamente o endpoint e o método indicados lá.

---

## 2. Permissões `email` e `public_profile`

Elas são usadas quando o app tem **Login com Facebook** e pede email e perfil básico.

- **MonsterChat hoje:** usa **Supabase (email/senha)**, não Facebook Login.  
- Se você **não** usa Login com Facebook no app, pode **remover** `email` e `public_profile` da solicitação do app na Meta (App Dashboard → App Review → Permissões) para não precisar testá-las.  
- Se **mantiver** essas permissões (por exemplo para uma funcionalidade futura), será preciso:
  - Implementar Login com Facebook no app, e  
  - Fazer pelo menos uma chamada que use esses dados, por exemplo:  
    `GET me?fields=id,name,email` com o token do usuário logado via Facebook.

---

## 3. Ordem sugerida antes de enviar o app para revisão

1. **Configurar canal WhatsApp** no MonsterChat (Configurações → Canais), com:
   - Phone Number ID (external_id)  
   - Access Token (System User recomendado)  
   - **WABA ID** (ID da conta Business), para a rota de teste poder chamar `subscribed_apps`

2. **Chamar a rota de teste do app** (para registrar as chamadas na Meta):
   ```
   GET https://SEU_DOMINIO/api/meta/test-permissions
   ```
   Assim você dispara:
   - `me/businesses` → **business_management**  
   - `{WABA_ID}/subscribed_apps` → **whatsapp_business_manage_events**

3. **Fazer a 1 chamada obrigatória de `manage_app_solution`** pelo Graph API Explorer (ou pelo endpoint indicado na própria tela da Meta).

4. **Webhook WhatsApp** já configurado e verificado no painel da Meta (URL do webhook + token de verificação), para a Meta ver que o app recebe eventos.

5. **Enviar uma mensagem** pelo MonsterChat (resposta a um contato) para manter `whatsapp_business_messaging` e `whatsapp_business_management` em uso antes/durante a revisão.

6. (Opcional) Se mantiver `email` / `public_profile`, implementar Login com Facebook e chamar `me?fields=id,name,email` após o login.

---

## 4. Variáveis de ambiente úteis

Para a rota `/api/meta/test-permissions` funcionar sem canal cadastrado, você pode definir:

- `WHATSAPP_ACCESS_TOKEN` – token com `business_management` e WhatsApp  
- `WHATSAPP_WABA_ID` – ID da conta WhatsApp Business (WABA)

Caso tenha um canal WhatsApp cadastrado no app, a rota usa o token e o WABA ID do primeiro canal ativo.

---

## 5. Referências

- [Business Management API – Get Started](https://developers.facebook.com/docs/business-management-apis/business-manager/get-started/)  
- [WhatsApp – Set up webhooks (subscribed_apps)](https://developers.facebook.com/docs/whatsapp/business-management-api/guides/set-up-webhooks/)  
- [App Review – Permissions and Features](https://developers.facebook.com/docs/app-review/)  
- [Graph API Explorer](https://developers.facebook.com/tools/explorer)
