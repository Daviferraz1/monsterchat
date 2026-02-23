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
