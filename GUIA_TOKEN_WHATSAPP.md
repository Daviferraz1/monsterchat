# 🔑 Guia: Token de Acesso WhatsApp (Meta)

Quando o MonsterChat retorna **401** ao responder mensagens (ex.: *"Session has expired"*), o **Access Token** do canal expirou. Este guia explica como obter um novo token — de preferência **permanente**, via System User.

**Documentação oficial:**  
[WhatsApp – Get started – Acquire an access token](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started#1--acquire-an-access-token-using-a-system-user-or-facebook-login)

---

## Opção 1: Token permanente (System User) — recomendado

Tokens de **System User** não expiram e são ideais para produção.

### Passos

1. **Acesse o Business Manager**  
   - [business.facebook.com](https://business.facebook.com) → faça login na conta da sua empresa.

2. **Configurações da Empresa**  
   - Menu ☰ → **Configurações da Empresa** (Business Settings).

3. **Usuários do sistema**  
   - No menu lateral: **Usuários** → **Usuários do sistema** (System Users).  
   - Clique em **Adicionar** (Add).  
   - Nome: ex. *"WhatsApp API MonsterChat"*.  
   - Função: **Administrador**.  
   - Crie o usuário.

4. **Atribuir ativos ao System User**  
   - Clique no System User criado.  
   - **Ativos atribuídos** → **Adicionar ativos**.  
   - Atribua:
     - **Aplicativos** → seu app do WhatsApp.  
     - **Contas do WhatsApp Business** → sua WABA (conta WhatsApp Business).  
   - Permissão: **Controle total** (Full control).

5. **Gerar o token**  
   - Na mesma tela do System User: **Gerar novo token** (Generate New Token).  
   - Selecione o **aplicativo** correto.  
   - Permissões necessárias:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
   - Clique em **Gerar token**.  
   - **Copie o token imediatamente** — a Meta não mostra novamente.

6. **Atualizar no MonsterChat**  
   - No app: **Configurações** → **Canais**.  
   - No canal WhatsApp correspondente, clique no botão **Atualizar token** (ícone de atualizar).  
   - Cole o novo token no prompt e confirme.

---

## Opção 2: Token via Facebook Login (usuário)

Se você ainda não usa System User, pode usar um **User Access Token** (token de usuário). Esse token pode ser de curta ou longa duração.

- **Curta duração:** expira em cerca de 1 hora.  
- **Longa duração:** expira em ~60 dias; depois é preciso renovar.

### Onde gerar

1. Acesse [developers.facebook.com](https://developers.facebook.com) → seu app.  
2. **Ferramentas** (Tools) → **Token de Acesso** (Access Token) ou **Graph API Explorer**.  
3. Selecione o app e as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Gere o token e, se quiser longa duração, troque por um long-lived token conforme a [documentação de access tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived).

Depois, use o mesmo fluxo do MonsterChat: **Canais** → **Atualizar token** e cole o token.

---

## Erro 401 ao responder

Se ao **enviar resposta** a API da Meta retornar **401**:

1. A mensagem de erro costuma indicar que o token expirou (ex.: *"Session has expired"*).  
2. Gere um novo token (de preferência **System User**, opção 1).  
3. Em **Configurações → Canais**, use **Atualizar token** no canal e cole o novo token.  
4. Tente enviar a mensagem novamente.

---

## Referências

- [WhatsApp – Get started (token: System User ou Facebook Login)](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started#1--acquire-an-access-token-using-a-system-user-or-facebook-login)  
- [Access Tokens – Documentação WhatsApp](https://developers.facebook.com/docs/whatsapp/access-tokens/)
