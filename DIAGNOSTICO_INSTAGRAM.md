# Diagnóstico: Recebo mensagens do Instagram mas não consigo responder

Este guia cobre as causas mais comuns de **“recebo e não consigo enviar”** e como corrigir.

---

## 1. Rota de diagnóstico no app

Abra no navegador (com o app rodando ou em produção):

```
GET https://SEU_DOMINIO/api/diagnostic/instagram
```

Ela mostra:

- Canais Instagram cadastrados
- Se **external_id** (Page ID) e **business_account_id** (ID Instagram) estão preenchidos
- Se o **token** consegue acessar a Página na Graph API
- Um resumo e checklist

Use isso para confirmar que o canal está configurado como abaixo.

---

## 2. Configuração do canal (Configurações → Canais)

O Instagram no MonsterChat usa **dois IDs** no mesmo canal:

| Campo no canal | O que colocar | Para que serve |
|----------------|----------------|----------------|
| **External ID** (ID da Página do Facebook) | ID da **Página do Facebook** vinculada ao Instagram | **Enviar** mensagens: a API usa `POST /{page-id}/messages`. |
| **ID da conta do Instagram** (business_account_id) | ID da **conta do Instagram** (ex.: `17841403342667626`) | **Receber**: o webhook envia `recipient.id` = esse ID; o canal é encontrado por ele. |

**Como achar cada um:**

- **Page ID (para enviar):**  
  [business.facebook.com](https://business.facebook.com) → Configurações da empresa → **Contas** → **Páginas** (não “Contas do Instagram”) → abra a página ligada ao Instagram → o **ID da página** é o que vai em **External ID**.

- **ID da conta Instagram (para receber):**  
  É o que aparece no log do webhook em `recipient.id` (ex.: `17841403342667626`). Esse mesmo valor vai em **“ID da conta do Instagram”** no canal.

Se **External ID** estiver com o ID da conta do Instagram em vez do ID da Página, você consegue **receber** (o webhook acha o canal pelo `business_account_id`), mas o **envio** pode falhar ou dar erro 500, porque a URL de envio exige o **Page ID**.

**Resumo:**  
- **External ID** = Page ID (Facebook) → usado para **enviar**.  
- **ID da conta do Instagram** = ID da conta Instagram → usado para **receber** (webhook).

---

## 3. Token

- Deve ser **Page Access Token** da **Página do Facebook** (não User Token genérico).
- Permissões necessárias (no app da Meta): `instagram_manage_messages`, `instagram_basic`, e as que a Meta pedir para mensagens (ex.: `pages_manage_metadata`, `pages_show_list`).
- Em **Configurações → Canais**, use **Atualizar token** e cole o token novo se tiver dúvida.

A rota `/api/diagnostic/instagram` testa se o token consegue acessar a Página (`GET /{page-id}?fields=id,name`). Se aparecer `tokenTest: "fail"`, o token ou o Page ID estão errados.

---

## 4. Janela de 24 horas (regra da Meta)

A Meta só permite **enviar** mensagem para quem **te enviou** uma mensagem nas **últimas 24 horas**.

- Se a pessoa não te mandou nada há mais de 24h, a API pode responder com erro (ex.: 500 ou “not in session”).
- Para testar: peça para o contato te mandar uma mensagem no Instagram e **responda em até 24h**.

Não há como contornar isso no “modo conversa”; fora da janela só com templates aprovados.

---

## 5. App em modo Desenvolvimento

Se o app da Meta está em **modo Desenvolvimento**:

- Só contas adicionadas como **testadores** podem ser destinatárias de mensagens.
- No painel: **App Dashboard** → **Roles** → **Testers** → adicione o usuário que vai receber a resposta.

Se o destinatário não for testador, a Meta pode devolver erro genérico (ex.: 500).

---

## 6. Instagram (app móvel) – “Ferramentas conectadas”

No **Instagram** (celular):

- **Configurações** → **Mensagens e respostas a stories** → **Controles de mensagem** → **Ferramentas conectadas**
- Ative **“Permitir acesso às mensagens”** (ou equivalente) para a Página/ferramenta que o MonsterChat usa.

Sem isso, a Meta pode bloquear o envio e retornar erro.

---

## 7. Erro 500 “An unknown error has occurred”

Quando a API devolve **500** sem detalhe:

- Use o **link de debug** que o MonsterChat mostra na tela (ou no corpo da resposta da API) e abra no navegador. A Meta às vezes dá mais detalhe lá.
- Confirme os itens acima: **Page ID no External ID**, token da Página, 24h, testador (se em desenvolvimento), e “Permitir acesso às mensagens” no app do Instagram.

---

## 8. Checklist rápido

- [ ] Canal Instagram em **Configurações → Canais** com **External ID** = **Page ID** (Facebook).
- [ ] **ID da conta do Instagram** = valor de `recipient.id` do webhook (ex.: `17841403342667626`).
- [ ] **Token** = Page Access Token dessa Página, com permissões de mensagens.
- [ ] Destinatário te enviou mensagem nas **últimas 24h**.
- [ ] Se o app está em desenvolvimento, destinatário é **testador** no app da Meta.
- [ ] No app do Instagram: **Ferramentas conectadas** → **Permitir acesso às mensagens** ativado.
- [ ] Rodou **GET /api/diagnostic/instagram** e `tokenTest` está **ok** e os IDs batem com o acima.

Se tudo isso estiver certo e ainda der 500, o próximo passo é o **link de debug da Meta** e, se precisar, abrir suporte com a Meta com esse link e o horário do envio.
