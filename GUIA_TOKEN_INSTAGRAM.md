# Como obter o token da página (Instagram Messaging)

O token que você coloca em **Configurações → Canais** (campo "Token de acesso") para o canal Instagram deve ser um **Page Access Token** da página do Facebook vinculada à sua conta Instagram, com permissão **instagram_manage_messages**.

## Opção 1: Graph API Explorer (recomendado)

1. Acesse **[developers.facebook.com](https://developers.facebook.com)** e entre na sua conta.
2. No menu superior, clique em **Ferramentas** → **Graph API Explorer** (ou vá em [developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)).
3. No canto superior direito, selecione o **app** que usa o Instagram (ex.: Zap-IG).
4. Clique em **Gerar token de acesso** (ou "Access Token").
5. Na janela de permissões, marque pelo menos:
   - **instagram_basic**
   - **instagram_manage_messages**
   - **pages_manage_metadata**
   - **pages_show_list** (pode ser pedido)
   - **pages_read_engagement** (pode ser pedido)
6. Faça login/autorize se a Meta pedir. O **User Access Token** aparecerá no campo "Access Token".
7. No Explorer, na barra de URL, troque para:
   ```text
   me/accounts?fields=id,name,access_token,tasks
   ```
   Método: **GET**. Clique em **Enviar**.
8. Na resposta JSON, procure a página vinculada ao seu Instagram (pode ser a que tem o mesmo nome ou a que você sabe que está conectada). Copie o **access_token** dessa página — esse é o **Page Access Token**.
9. (Opcional) Para um token de longa duração (60 dias), use depois o endpoint de troca por long-lived token (ver documentação da Meta).

Esse **access_token** da página é o que você cola em **Configurações → Canais** no MonsterChat, no campo **Token de acesso** do canal Instagram.

---

## Opção 2: Painel do app (Instagram / Messenger)

1. Acesse **[developers.facebook.com](https://developers.facebook.com)** → seu **app**.
2. No menu lateral: **Messenger** → **Configurações do Instagram** (ou **Instagram** → Configuração).
3. Se a Meta disponibilizou a ferramenta de configuração do Instagram, pode haver um fluxo para **conectar conta** e **gerar/copiar token**. Use o token exibido ali.

Se não aparecer essa opção, use a **Opção 1** (Graph API Explorer).

---

## Conferir se o token tem a permissão certa

- No Graph API Explorer, cole o **Page Access Token** no campo "Access Token".
- Chame: `me?fields=id,name` (ou `{page-id}?fields=id,name`) com método **GET**.
- Se funcionar, o token é válido. Para enviar mensagens pelo Instagram, o app precisa ter a permissão **instagram_manage_messages** aprovada (em modo desenvolvimento, apenas testadores podem usar; em produção, é preciso passar pela App Review).

---

## Resumo

| Onde pegar | O que usar no MonsterChat |
|------------|---------------------------|
| Graph API Explorer: `me/accounts` → pegar `access_token` da página vinculada ao Instagram | Colar em **Configurações → Canais** → campo **Token de acesso** do canal Instagram |
| External ID do canal | **ID da Página** (o `id` da mesma página no `me/accounts`), não o ID da conta do Instagram |
| ID da conta do Instagram | Manter no campo "ID da conta do Instagram" (ex.: 17841403342667626) para o webhook |

- Documentação: [Getting Started - Instagram Messaging](https://developers.facebook.com/docs/messenger-platform/instagram/get-started/)
- Token de longa duração: [Long-Lived Tokens](https://developers.facebook.com/docs/facebook-login/access-tokens/refreshing/#get-a-long-lived-page-access-token)
