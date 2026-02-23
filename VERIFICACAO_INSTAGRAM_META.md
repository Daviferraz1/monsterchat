# Verificação: sistema Instagram vs recursos da Meta

Este documento cruza as permissões/recursos exibidos no painel **Permissões e recursos** da Meta (API do Instagram) com o que o MonsterChat **usa** e o que está **pronto** ou **pendente**.

---

## Resumo rápido

| Situação | O que fazer |
|----------|-------------|
| **Rejeitadas (0 chamadas)** | Human Agent, `instagram_business_basic`, `instagram_business_manage_messages` — executar fluxo que use a permissão (ver abaixo). |
| **Pronto para teste** | Várias com chamadas já contabilizadas; rodar testes no App Review quando solicitado. |
| **Não adicionadas à análise** | Só adicione se o app realmente usar (ex.: insights, comentários, conteúdo patrocinado). Para só DM, pode ignorar. |

---

## 1. Recursos com status “Análise do app rejeitada” (0 chamadas)

### Human Agent
- **O que é:** Respostas por agente humano até 7 dias após a mensagem do usuário.
- **O que o app faz:** O MonsterChat é uma caixa de entrada humana (agente responde no chat). Cada envio pelo app já é “human agent”.
- **Por que 0 chamadas:** A Meta pode contar só quando a mensagem é enviada **com a tag** `human_agent` (fora da janela de 24h) ou quando o revisor vê o fluxo no teste.
- **Ação:**  
  1. O app passou a enviar mensagens Instagram com suporte à tag Human Agent quando aplicável (ver código).  
  2. No App Review, demonstrar: usuário envia mensagem → agente responde pelo MonsterChat; se possível, uma resposta após 24h usando a tag.

### instagram_business_basic
- **O que é:** Ler mídia e perfil de conta Instagram Business.
- **O que o app faz:** Usa perfil (nome, foto) via `GET /{ig-scoped-user-id}` com `fields=name,username,profile_pic` no webhook.
- **Por que 0 chamadas:** A contagem pode ser por token/app; o uso real é no webhook ao receber mensagem.
- **Ação:** Garantir que há pelo menos um canal Instagram ativo e que mensagens são recebidas (e o app chama a API de perfil). Usar a rota de teste `/api/meta/test-permissions` (Instagram) para disparar `me/accounts?fields=instagram_business_account` e assim registrar uso explícito.

### instagram_business_manage_messages
- **O que é:** Enviar e receber mensagens na conta profissional do Instagram.
- **O que o app faz:** Envia com `POST /{page_id}/messages` e recebe via webhook.
- **Por que 0 chamadas:** Igual acima; a Meta pode não estar atribuindo ao app/token.
- **Ação:** Enviar pelo menos uma mensagem de resposta pelo MonsterChat (canal Instagram) antes/durante o App Review. Chamar a rota de teste que usa o token do canal Instagram também ajuda a registrar uso.

---

## 2. Recursos “Pronto para teste” ou “Pronto para publicar”

Estes já têm chamadas registradas ou estão aprovados. Só é necessário rodar o fluxo de teste do App Review quando a Meta pedir:

- **business_management** (21) – rota `/api/meta/test-permissions` (WhatsApp) já chama `me/businesses`.
- **catalog_management** (12) – só relevante se o app gerencia catálogo; caso contrário, considere remover do caso de uso.
- **email** (Pronto para publicar) – usado se houver Login com Facebook; senão pode remover.
- **instagram_basic** (14) – perfil no webhook + rota de teste Instagram.
- **instagram_business_content_publish** (0) – publicação de posts; se o app não publica feed, remover.
- **instagram_content_publish** (6) – idem.
- **instagram_manage_insights** (8) – insights; se não usar, remover.
- **instagram_manage_messages** (5) – envio/recebimento; já usado pelo app.
- **instagram_shopping_tag_products** (5) – só se usar produtos no catálogo; senão remover.
- **pages_read_engagement** (37), **pages_show_list** (20) – rotas de teste podem chamar `me/accounts` e `me?fields=id,name,instagram_business_account` para registrar.
- **public_profile** (0) – o app lê os Campos de Perfil Público Padrão no nó do Usuário quando aplicável. Essa permissão é **concedida automaticamente a todos os apps** pela Meta; não exige chamada específica para aprovação. Se o app usar Login com Facebook, `GET me?fields=id,name` (com User Access Token) registra o uso no painel.

**public_profile (detalhe):** A permissão possibilita ler os Campos de Perfil Público Padrão no nó do Usuário (ex.: id, nome). Como é concedida automaticamente a todos os apps, não é necessário implementar uma chamada extra só para “contar” no painel — ela já costuma aparecer como “Pronto para teste” por ser padrão.

---

## 3. Recursos “+ Adicionar à análise do app”

Não estão na análise. Só adicione se o app **realmente** usar:

- **Business Asset User Profile Access** – leitura de perfil em ativos de negócio.
- **Instagram Public Content Access** – busca por hashtag.
- **ads_management**, **ads_read** – anúncios.
- **instagram_branded_content_creator** – conteúdo patrocinado (criador).
- **instagram_business_manage_comments** – comentários em posts.
- **instagram_business_manage_insights** – insights (métricas).
- **instagram_creator_marketplace_discovery** – marketplace de criadores.
- **instagram_manage_contents** – excluir posts.
- **instagram_manage_upcoming_events** – eventos futuros.

Para um app que **só faz DM no Instagram**, o ideal é **não** adicionar essas permissões e manter apenas as que o app usa (mensagens, perfil básico, páginas).

---

## 4. O que o MonsterChat usa de fato (Instagram)

- Receber mensagens (webhook).
- Enviar mensagens de texto (resposta no chat).
- Buscar perfil do usuário (nome, foto) via Graph API.
- Opcional: enviar com tag **Human Agent** quando a resposta for fora da janela de 24h (até 7 dias).

Permissões alinhadas a esse uso: **instagram_manage_messages** (ou **instagram_business_manage_messages**), **instagram_basic** (ou **instagram_business_basic**), **pages_show_list**, **pages_read_engagement**, **business_management** e, se usar Login com Facebook, **public_profile** e **email**. **Human Agent** deve ser demonstrado no fluxo (e, no código, com tag quando aplicável).

---

## 5. Rotas do app que ajudam na contagem de chamadas

| Objetivo | Rota / ação |
|----------|-------------|
| business_management, whatsapp_business_manage_events | `GET /api/meta/test-permissions` (token WhatsApp) |
| pages_show_list, pages_read_engagement, instagram_basic | `GET /api/meta/test-permissions` (token Instagram/canal ativo) – ver abaixo |
| instagram_manage_messages / instagram_business_manage_messages | Enviar uma mensagem pelo chat do MonsterChat (canal Instagram) |
| Human Agent | Resposta enviada pelo app (com tag human_agent quando fora da janela de 24h); demonstrar no App Review |

A rota `GET /api/meta/test-permissions` usa o token do primeiro canal **WhatsApp** ativo para `me/businesses` e `subscribed_apps`. Se houver um canal **Instagram** ativo, ela também chama `me?fields=id,name,instagram_business_account` (resultado `instagram_pages_basic`), o que ajuda a registrar uso de **pages_read_engagement** e **instagram_basic** / **instagram_business_basic**.

---

## 6. Checklist antes de submeter / re-submeter

- [ ] Pelo menos um canal Instagram configurado e ativo (External ID = Page ID, token com permissões de mensagens).
- [ ] Ter enviado **pelo menos uma** mensagem de resposta pelo MonsterChat (canal Instagram) para registrar uso de mensagens.
- [ ] Ter chamado a rota de teste de permissões (com token que inclua Instagram) para registrar pages + instagram_basic.
- [ ] No App Review, demonstrar: usuário envia mensagem no Instagram → agente responde no MonsterChat (Human Agent).
- [ ] Remover do caso de uso as permissões que o app não usa (insights, publicação de feed, comentários, ads, etc.) para simplificar a revisão.

Com isso, o sistema fica alinhado a “todos os recursos” que você **efetivamente** usa no Instagram (DM + perfil + Human Agent) e com passos claros para as que estão rejeitadas ou com 0 chamadas.
