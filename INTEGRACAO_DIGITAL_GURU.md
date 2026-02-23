# Integração Digital Manager Guru

O MonsterChat recebe vendas processadas pelo **Digital Manager Guru** via webhook e associa ao contato (por e-mail e telefone), exibindo no perfil se é aluno, quais produtos comprou e a situação.

## Referência da API Guru

- [Referência API](https://docs.digitalmanager.guru/developers/referencia-api)
- [Webhooks](https://docs.digitalmanager.guru/developers/webhooks)
- [Webhook para Transações](https://docs.digitalmanager.guru/developers/webhook-para-transacoes)

## Configuração no MonsterChat

### 1. Variável de ambiente

No painel da Guru: **Minha Conta → API** copie o **Token API** (Account Token).

No MonsterChat (Vercel ou `.env` local) defina:

```env
DIGITAL_GURU_ACCOUNT_TOKEN=seu_token_api_aqui
```

Esse token é enviado no body do webhook como `api_token` e usado para validar que a requisição veio da Guru.

### 2. URL do webhook no admin da Guru

No admin da Guru, em [Webhooks](https://digitalmanager.guru/admin/settings/webhooks), configure:

- **Recurso:** Transações (ou o que dispara ao processar uma venda)
- **URL:** `https://seu-dominio-monsterchat.vercel.app/api/integrations/digital-guru`

A Guru envia um POST com o payload completo da transação (contact, product/items, status, dates, etc.). O MonsterChat:

- Valida o `api_token` com `DIGITAL_GURU_ACCOUNT_TOKEN`
- Extrai `contact.email` e `contact.phone_number` (+ `contact.phone_local_code`)
- Extrai produtos de `product` ou `items[]`
- Busca contatos no MonsterChat com esse e-mail ou telefone (normalizado)
- Atualiza `metadata.digital_guru` do contato: `is_student: true`, lista de produtos, situação (status da transação)

**Importante:** a Guru exige **HTTP 200** para considerar o webhook processado. O MonsterChat sempre retorna 200 quando o token é válido (mesmo que nenhum contato seja encontrado), para evitar retentativas. Em caso de token inválido, retorna 401 (a Guru não reenvia).

## O que aparece no perfil do contato

No painel **Informações do contato** (ícone no header do chat):

- **Digital Guru**
  - Situação: **Aluno** (ou não identificado)
  - Situação (status da transação, ex.: approved)
  - **Produtos comprados** (nome e data)
  - Última atualização (last_sync_at)

## Payload genérico (opcional)

Se você enviar um POST manual ou de outro sistema (sem o formato Guru), use:

```json
{
  "email": "aluno@email.com",
  "phone": "11999999999",
  "product_name": "Nome do curso",
  "product_id": "opcional",
  "order_id": "opcional",
  "situation": "Aprovado",
  "purchased_at": "2025-02-19T12:00:00Z"
}
```

Pelo menos um de `email` ou `phone` e o campo `product_name` são obrigatórios.

## Como saber se está funcionando

1. **Status da integração**  
   Abra no navegador:  
   `GET https://seu-dominio/api/integrations/digital-guru`  
   A resposta inclui:
   - `webhook_configured: true/false` — indica se `DIGITAL_GURU_ACCOUNT_TOKEN` está definido.
   - `how_to_verify` — passos para conferir.

2. **Depois de uma venda na Guru**  
   No MonsterChat, abra um contato que tenha o **mesmo e-mail ou telefone** do comprador. No painel **Informações do contato** (ícone no header do chat) deve aparecer o bloco **Digital Guru** com situação “Aluno” e os produtos comprados.

3. **Logs na Vercel**  
   Em **Vercel → Projeto → Logs** (ou Functions), filtre por `[Digital Guru]` para ver erros ou confirmação de processamento.

## Dados antigos (importar transações já existentes na Guru)

O **webhook só envia vendas novas**. Para ter **todos os pedidos retroativos** disponíveis para consulta no MonsterChat:

### Opção 1 – Pela interface (recomendado)

1. No MonsterChat, vá em **Últimas vendas** (menu lateral).
2. Clique em **Importar vendas antigas (retroativas)** para expandir o painel.
3. Obtenha um **array JSON** de transações no formato da Guru:
   - **API da Guru:** use seu **User Token** (Meu Perfil → Tokens API) e chame o endpoint de listagem de transações da Guru ([Transactions](https://docs.digitalmanager.guru/developers/transactions) / [Myorders](https://docs.digitalmanager.guru/developers/myorders)). A documentação atual da Guru traz a URL e a paginação.
   - **Exportação:** se a Guru permitir exportar vendas (CSV/JSON), converta para um array no formato do webhook (cada item com `id`, `contact`, `product` ou `items`, `status`, `dates`, etc.).
4. Cole o JSON no campo (deve ser um **array** `[ { ... }, { ... } ]`) e clique em **Importar**.
5. O servidor usa o `DIGITAL_GURU_ACCOUNT_TOKEN` configurado no ambiente; não é preciso colar o token na tela. As transações passam a aparecer em **Últimas vendas** e nos perfis dos contatos correspondentes.

### Opção 2 – Via API (scripts / integração)

Envie o array de transações para o endpoint de sync, informando o Account Token no body:

```http
POST https://seu-dominio/api/integrations/digital-guru/sync
Content-Type: application/json

{
  "api_token": "seu_account_token_guru",
  "transactions": [
    { "id": "...", "contact": { "email": "...", "phone_number": "...", "name": "..." }, "product": { "name": "..." }, "status": "approved", "dates": { "ordered_at": "..." }, ... },
    ...
  ]
}
```

Ou use o endpoint que usa o token do servidor (sem enviar o token no body):

```http
POST https://seu-dominio/api/integrations/digital-guru/import-retroactive
Content-Type: application/json

{
  "transactions": [ ... ]
}
```

Cada item de `transactions` deve estar no **mesmo formato** que a Guru envia no webhook (incluindo `contact`, `product` ou `items`, `status`, `dates`, etc.).

Resposta esperada:
- `processed`: quantas transações foram processadas.
- `contacts_updated`: quantos contatos foram atualizados no total.
- `errors`: lista de erros por transação (se houver).

## Últimas vendas (painel do atendente)

Cada venda recebida (webhook ou sync) é registrada na tabela **`guru_sales`** no banco. O atendente pode ver as últimas vendas sem sair do sistema:

- No menu lateral: **Últimas vendas** → lista data, cliente, contato, produto(s), status.
- Se o comprador já tiver conversado no chat, aparece **Abrir conversa** → abre a conversa no Inbox.

**Migration:** rode a migration `015_guru_sales.sql` no Supabase (ou `supabase db push`) para criar a tabela `guru_sales`.

**API:** `GET /api/integrations/digital-guru/sales?limit=50&offset=0` retorna as vendas com `conversation_id` quando houver conversa do contato. Use `search=...` para filtrar por e-mail, telefone ou nome.

## Vendas que ainda não foram recebidas (buscar na Guru)

Vendas que existem só na Guru (anteriores ao webhook ou que não dispararam o webhook) podem ser trazidas de duas formas:

### 1. Buscar por e-mail ou telefone (na interface)

Na página **Últimas vendas** → **Importar vendas antigas** há a opção **Buscar vendas na Guru**: informe e-mail ou telefone e clique em **Buscar na Guru**. Se o servidor estiver configurado, as vendas retornadas pela API da Guru aparecem e você pode clicar em **Importar estas X vendas**.

**Requer no servidor (Vercel / .env):**

- **`DIGITAL_GURU_USER_TOKEN`** – User Token da Guru. Em **Meu Perfil** → **Tokens API** → **Adicionar**; copie o token (só é exibido uma vez). É diferente do *Account Token* usado no webhook.
- **`DIGITAL_GURU_API_BASE_URL`** – URL **completa** do endpoint de listagem de transações da Guru. A documentação oficial define o path e os parâmetros:
  - **[Transactions (API)](https://docs.digitalmanager.guru/developers/transactions)** – consulte a página para a URL exata (ex.: `https://api.digitalmanager.guru/v1/transactions` ou outro path como `/myorders`).
  - A autenticação é `Authorization: Bearer {User Token}`.

**Se não conseguir puxar transações antigas:**

1. Confirme que está usando o **User Token** (Meu Perfil → Tokens API), não o Account Token do webhook.
2. Confirme que **DIGITAL_GURU_API_BASE_URL** é a URL completa do endpoint (incluindo path), como indicado na [documentação Transactions](https://docs.digitalmanager.guru/developers/transactions). Se a Guru usar outro path (ex.: `/myorders`, `/orders`), use essa URL.
3. A API da Guru exige pelo menos um de: `ordered_at_ini`, `ordered_at_end`, `contact_id`, etc., e **não permite período maior que 180 dias**. O MonsterChat envia automaticamente **ordered_at_ini** (180 dias atrás) e **ordered_at_end** (hoje) quando você busca só por e-mail/telefone, obtém as transações do período e filtra por contato no próprio sistema. Para períodos maiores, use várias buscas com intervalos de 180 dias ou a Opção 2 (colar JSON).
4. Se a API usar parâmetros ou formato de data diferente, obtenha o JSON manualmente (Postman/curl conforme a doc) e use a **Opção 2** abaixo (colar o JSON na importação).

### 2. Importar colando o JSON

Use **Importar vendas antigas** e cole o array JSON de transações obtido da API ou exportação da Guru (mesmo formato do webhook). Não precisa configurar User Token no servidor; basta ter o Account Token para o webhook.
