# Testes: "Gerenciar mensagens e conteúdo no Instagram" (Meta)

Este guia ajuda a completar os testes de API que a Meta exige para cada permissão da tela **"Gerenciar mensagens e conteúdo no Instagram"**.

---

## Importante: só peça o que o app usa

O MonsterChat usa o Instagram **só para mensagens diretas (DM)** — receber e enviar mensagens. Ele **não** usa:

- Publicação de posts (content_publish)
- Insights / métricas (manage_insights)
- Comentários (manage_comments)
- Shopping / produtos (shopping_tag_products)
- Conteúdo patrocinado (branded_content)

**Recomendação:** No painel da Meta (App Review → Permissões), **remova** as permissões que o app não usa. Assim você não precisa testá-las e a revisão fica mais simples. Mantenha só as que aparecem abaixo em "Permissões que o MonsterChat usa".

---

## Onde fazer as chamadas de teste

Use o **[Graph API Explorer](https://developers.facebook.com/tools/explorer)**:

1. Selecione o app **MonsterChat**.
2. Em **"Permissões"**, marque a permissão que você quer testar.
3. Clique em **"Gerar token de acesso"** (para incluir essa permissão no token).
4. No campo **Endpoint**, digite apenas o path (ex.: `me/businesses`). A base `https://graph.facebook.com/v24.0/` já está no Explorer.
5. Método **GET** (ou **POST** quando indicado).
6. Clique em **Enviar**.

---

## Permissões que o MonsterChat usa (prioridade para testar)

| Permissão | Endpoint no Explorer | Método | Observação |
|-----------|---------------------|--------|------------|
| `business_management` | `me/businesses` | GET | Ou use a rota do app: `/api/meta/test-permissions`. |
| `instagram_manage_messages` ou `instagram_business_manage_messages` | Enviar uma mensagem pelo MonsterChat (Configurações → canal Instagram ativo). | — | A chamada é `POST {page_id}/messages`; o app já faz isso ao responder no chat. Basta responder um contato pelo Instagram no MonsterChat. |
| `instagram_basic` | `me/accounts?fields=instagram_business_account` | GET | Ou use o ID da sua Página: `{page_id}?fields=instagram_business_account`. |
| `instagram_business_basic` | Igual ao acima, ou enviar/receber mensagem pelo app. | GET | Depende do tipo de conta (API com Facebook vs Instagram Login). |
| `pages_show_list` | `me/accounts` | GET | Lista páginas do usuário. |
| `pages_read_engagement` | `me/accounts?fields=access_token,name` | GET | Ou `{page_id}?fields=name`. |
| `public_profile` | `me?fields=id,name` | GET | Só necessário se o app usa Login com Facebook. |
| `email` | `me?fields=id,name,email` | GET | Só necessário se o app usa Login com Facebook e pede email. |

---

## Permissões “1 chamada obrigatória” – endpoints no Explorer

Faça **uma** chamada para cada permissão que você **manteve** no app:

| Permissão | Endpoint | Método |
|-----------|----------|--------|
| `business_management` | `me/businesses` | GET |
| `instagram_business_manage_insights` | `{instagram_business_account_id}/insights?metric=follower_count&period=day` | GET |
| `instagram_business_content_publish` | Requer mídia; em geral testado ao publicar pelo app. | POST |
| `instagram_business_manage_comments` | `{ig_media_id}/comments` | GET |
| `instagram_branded_content_ads_brand` | Documentação Meta para “branded content”. | — |
| `pages_read_engagement` | `me/accounts?fields=name` | GET |
| `instagram_shopping_tag_products` | Endpoints de catálogo/produtos. | — |
| `instagram_manage_comments` | `{ig_media_id}/comments` | GET |
| `instagram_manage_insights` | `{ig_user_id}/insights?metric=follower_count&period=day` | GET |
| `instagram_content_publish` | Publicar conteúdo via API. | POST |
| `instagram_basic` | `me/accounts?fields=instagram_business_account` | GET |

Substitua `{page_id}`, `{instagram_business_account_id}`, `{ig_media_id}`, `{ig_user_id}` pelos IDs reais da sua conta/página/mídia.

---

## Permissões “chamadas de teste” (0 chamadas)

Para a Meta contar uso, faça **pelo menos uma** chamada que use a permissão:

| Permissão | Como testar |
|-----------|--------------|
| `instagram_business_manage_messages` | Enviar uma resposta a um contato pelo Instagram no MonsterChat (o app chama `POST {page_id}/messages`). |
| `instagram_manage_messages` | Mesmo que acima. |
| `instagram_business_basic` | GET `me/accounts?fields=instagram_business_account` ou usar o app para mensagens. |
| `instagram_branded_content_brand` | Só se o app usa conteúdo patrocinado; caso contrário, remova a permissão. |
| `email` | GET `me?fields=id,name,email` (token com permissão `email`). Só se usar Login com Facebook. |
| `public_profile` | GET `me?fields=id,name`. Só se usar Login com Facebook. |
| **Human Agent** | Indica uso por agente humano; em geral atestado pelo fluxo do app (agente respondendo no chat). |
| `pages_show_list` | GET `me/accounts`. |
| `catalog_management` | Só se o app gerencia catálogo de produtos; caso contrário, remova. |

---

## Ordem sugerida (resumo)

1. **Remover permissões não usadas** no App Dashboard (insights, content_publish, shopping, branded_content, etc.), se o MonsterChat só faz mensagens.
2. **Graph API Explorer** — fazer uma chamada para cada permissão que ficou:
   - `business_management` → `me/businesses`
   - `instagram_basic` → `me/accounts?fields=instagram_business_account`
   - `pages_show_list` → `me/accounts`
   - `pages_read_engagement` → `me/accounts?fields=name`
   - `public_profile` → `me?fields=id,name`
   - `email` → `me?fields=id,name,email` (só se usar Facebook Login)
3. **No app:** responder pelo menos uma mensagem no Instagram (MonsterChat) para registrar uso de `instagram_manage_messages` / `instagram_business_manage_messages`.
4. Conferir no painel da Meta se as contagens de “chamada(s) de API” ou “obrigatória(s)” passaram de 0 para 1 onde aplicável.

---

## Referências

- [Graph API Explorer](https://developers.facebook.com/tools/explorer)
- [Instagram Platform – App Review](https://developers.facebook.com/docs/instagram-platform/app-review/)
- [Page – Instagram accounts](https://developers.facebook.com/docs/graph-api/reference/page/instagram_accounts/)
- [Instagram Messaging](https://developers.facebook.com/docs/messenger-platform/instagram/)
