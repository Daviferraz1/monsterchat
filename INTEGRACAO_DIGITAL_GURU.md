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

O **webhook só envia vendas novas**. Para trazer transações antigas:

1. **Opção A – Sync em lote (recomendado)**  
   Use a API da Guru para listar transações ([Transactions](https://docs.digitalmanager.guru/developers/transactions) ou [Myorders](https://docs.digitalmanager.guru/developers/myorders)) com seu **User Token** (Bearer). Para cada transação retornada (mesmo formato do webhook), monte um array e envie:

   ```http
   POST https://seu-dominio/api/integrations/digital-guru/sync
   Content-Type: application/json

   {
     "api_token": "seu_account_token_guru",
     "transactions": [
       { "id": "...", "contact": { "email": "...", "phone_number": "...", ... }, "product": { "name": "..." }, "status": "approved", "dates": { ... }, ... },
       ...
     ]
   }
   ```

   Cada item de `transactions` deve estar no **mesmo formato** que a Guru envia no webhook (incluindo `contact`, `product` ou `items`, `status`, `dates`, etc.). O endpoint `/sync` processa cada um e atualiza os contatos no MonsterChat.

2. **Opção B – Exportar da Guru e enviar**  
   Se a Guru permitir exportar transações (CSV/JSON), converta para o formato do webhook e use o mesmo `POST /api/integrations/digital-guru/sync` com o array em `transactions`.

Resposta esperada do `/sync`:
- `processed`: quantas transações foram processadas.
- `contacts_updated`: quantos contatos foram atualizados no total.
- `errors`: lista de erros por transação (se houver).

## Últimas vendas (painel do atendente)

Cada venda recebida (webhook ou sync) é registrada na tabela **`guru_sales`** no banco. O atendente pode ver as últimas vendas sem sair do sistema:

- No menu lateral: **Últimas vendas** → lista data, cliente, contato, produto(s), status.
- Se o comprador já tiver conversado no chat, aparece **Abrir conversa** → abre a conversa no Inbox.

**Migration:** rode a migration `015_guru_sales.sql` no Supabase (ou `supabase db push`) para criar a tabela `guru_sales`.

**API:** `GET /api/integrations/digital-guru/sales?limit=50&offset=0` retorna as vendas com `conversation_id` quando houver conversa do contato.
