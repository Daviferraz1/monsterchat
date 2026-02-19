# CURSOR PROJECT PROMPT — Sistema de Conversa Unificado (WhatsApp + Instagram)

## Identidade do Projeto

Você é um desenvolvedor sênior full-stack construindo um **sistema de inbox unificado** que integra **WhatsApp Business Cloud API** e **Instagram Messaging API** em uma única plataforma de atendimento. O banco de dados é **Supabase (PostgreSQL)**. O projeto se chama **MonsterChat**.

---

## Stack Tecnológica

- **Backend:** Node.js 20+ com Express.js e TypeScript
- **Banco de Dados:** Supabase (PostgreSQL + Realtime + Auth + Storage + RLS)
- **Frontend:** Next.js 14+ (App Router) com TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **Realtime:** Supabase Realtime (postgres_changes)
- **APIs Externas:** Meta Graph API v21.0 (WhatsApp Cloud API + Instagram Messaging API)
- **Autenticação:** Supabase Auth (email/senha para agentes e admins)
- **Storage:** Supabase Storage (para mídias recebidas/enviadas)
- **Deploy:** Backend em Railway/Render, Frontend em Vercel

---

## Estrutura de Pastas

```
monsterchat/
├── apps/
│   ├── api/                        # Backend Express + TypeScript
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   ├── supabase.ts     # Cliente Supabase (service role)
│   │   │   │   └── env.ts          # Variáveis de ambiente tipadas
│   │   │   ├── webhooks/
│   │   │   │   ├── whatsapp.webhook.ts
│   │   │   │   ├── instagram.webhook.ts
│   │   │   │   └── verify.webhook.ts
│   │   │   ├── services/
│   │   │   │   ├── message.service.ts
│   │   │   │   ├── conversation.service.ts
│   │   │   │   ├── contact.service.ts
│   │   │   │   ├── channel.service.ts
│   │   │   │   ├── whatsapp.service.ts    # Envio WhatsApp
│   │   │   │   ├── instagram.service.ts   # Envio Instagram
│   │   │   │   └── media.service.ts       # Download/upload de mídias
│   │   │   ├── routes/
│   │   │   │   ├── webhook.routes.ts
│   │   │   │   ├── conversation.routes.ts
│   │   │   │   ├── message.routes.ts
│   │   │   │   └── channel.routes.ts
│   │   │   ├── middlewares/
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── webhook-signature.middleware.ts
│   │   │   │   └── error.middleware.ts
│   │   │   ├── types/
│   │   │   │   ├── whatsapp.types.ts
│   │   │   │   ├── instagram.types.ts
│   │   │   │   ├── database.types.ts     # Gerado pelo Supabase CLI
│   │   │   │   └── common.types.ts
│   │   │   ├── utils/
│   │   │   │   ├── logger.ts
│   │   │   │   └── helpers.ts
│   │   │   └── app.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                        # Frontend Next.js
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/
│       │   │   │   └── login/page.tsx
│       │   │   ├── (dashboard)/
│       │   │   │   ├── layout.tsx          # Layout com sidebar
│       │   │   │   ├── inbox/
│       │   │   │   │   ├── page.tsx        # Lista de conversas
│       │   │   │   │   └── [id]/page.tsx   # Chat individual
│       │   │   │   ├── contacts/page.tsx
│       │   │   │   └── settings/
│       │   │   │       ├── page.tsx
│       │   │   │       └── channels/page.tsx
│       │   │   └── layout.tsx
│       │   ├── components/
│       │   │   ├── chat/
│       │   │   │   ├── ChatWindow.tsx
│       │   │   │   ├── MessageBubble.tsx
│       │   │   │   ├── MessageInput.tsx
│       │   │   │   ├── MediaMessage.tsx
│       │   │   │   └── ChatHeader.tsx
│       │   │   ├── inbox/
│       │   │   │   ├── ConversationList.tsx
│       │   │   │   ├── ConversationItem.tsx
│       │   │   │   └── InboxFilters.tsx
│       │   │   ├── layout/
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   ├── Header.tsx
│       │   │   │   └── ChannelBadge.tsx
│       │   │   └── ui/               # shadcn/ui components
│       │   ├── hooks/
│       │   │   ├── useRealtimeMessages.ts
│       │   │   ├── useConversations.ts
│       │   │   ├── useSupabase.ts
│       │   │   └── useSendMessage.ts
│       │   ├── lib/
│       │   │   ├── supabase/
│       │   │   │   ├── client.ts     # Browser client
│       │   │   │   └── server.ts     # Server client (SSR)
│       │   │   └── utils.ts
│       │   └── types/
│       │       └── index.ts
│       ├── package.json
│       └── tailwind.config.ts
│
├── packages/
│   └── shared/                     # Tipos e utilidades compartilhadas
│       ├── types.ts
│       └── constants.ts
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_create_channels.sql
│   │   ├── 002_create_contacts.sql
│   │   ├── 003_create_conversations.sql
│   │   ├── 004_create_messages.sql
│   │   ├── 005_create_agents.sql
│   │   ├── 006_enable_rls.sql
│   │   ├── 007_create_indexes.sql
│   │   └── 008_enable_realtime.sql
│   ├── seed.sql
│   └── config.toml
│
├── .env.example
├── docker-compose.yml              # Supabase local (opcional)
├── turbo.json                      # Se usar Turborepo
└── README.md
```

---

## Schema do Banco de Dados (Supabase / PostgreSQL)

### Tabela: channels
```sql
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('whatsapp', 'instagram')),
  name text not null,
  external_id text not null,          -- phone_number_id (WA) ou ig_user_id (IG)
  business_account_id text,           -- waba_id ou page_id
  access_token text not null,
  webhook_verify_token text,
  is_active boolean default true,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Tabela: contacts
```sql
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  channel_type text not null,
  external_id text not null,          -- wa_id ou ig_scoped_user_id
  name text,
  phone text,
  profile_pic_url text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(channel_type, external_id)
);
```

### Tabela: conversations
```sql
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id),
  contact_id uuid not null references public.contacts(id),
  status text not null default 'open' check (status in ('open', 'pending', 'closed', 'snoozed')),
  assigned_to uuid references auth.users(id),
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  subject text,
  tags text[] default '{}',
  unread_count integer default 0,
  last_message_at timestamptz,
  last_message_preview text,
  closed_at timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Tabela: messages
```sql
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('contact', 'agent', 'system', 'bot')),
  sender_id text,                     -- agent user id ou contact external id
  content_type text not null default 'text'
    check (content_type in ('text','image','video','audio','document','sticker','location','contact_card','story_mention','story_reply','template','interactive','reaction')),
  body text,
  media_url text,
  media_mime_type text,
  media_filename text,
  media_size integer,
  external_id text,                   -- message id retornado pela Meta
  status text default 'pending'
    check (status in ('pending','sent','delivered','read','failed')),
  error_message text,
  reply_to_id uuid references public.messages(id),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);
```

### Tabela: quick_replies (respostas rápidas)
```sql
create table public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  shortcut text unique,              -- ex: /ola, /preco
  body text not null,
  category text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
```

### Tabela: internal_notes (notas internas na conversa)
```sql
create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz default now()
);
```

### Índices
```sql
create index idx_messages_conversation_created on messages(conversation_id, created_at desc);
create index idx_messages_external_id on messages(external_id) where external_id is not null;
create index idx_conversations_status on conversations(status, last_message_at desc);
create index idx_conversations_assigned on conversations(assigned_to, status);
create index idx_contacts_lookup on contacts(channel_type, external_id);
```

### Realtime
```sql
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table internal_notes;
```

### RLS (Row Level Security)
```sql
alter table channels enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

-- Agentes autenticados podem ler tudo
create policy "Agents can read all conversations"
  on conversations for select
  to authenticated
  using (true);

create policy "Agents can read all messages"
  on messages for select
  to authenticated
  using (true);

-- Apenas service_role pode inserir via webhook
create policy "Service role can insert messages"
  on messages for insert
  to service_role
  using (true);
```

---

## Regras e Convenções de Código

### Gerais
- Todo código em **TypeScript** com strict mode
- Usar **async/await**, nunca callbacks
- Tratar TODOS os erros com try/catch e logging estruturado
- Nunca expor tokens ou secrets — tudo via variáveis de ambiente
- Validar TODOS os inputs de webhook com signature verification
- Nomes de variáveis e funções em **inglês**, comentários podem ser em **português**

### Backend (API)
- Cada webhook handler deve retornar **200 imediatamente** antes de processar
- Usar **service pattern**: routes → controllers → services → supabase
- Criar types específicos para cada payload da Meta (WhatsApp e Instagram têm estruturas diferentes)
- Middleware de verificação de assinatura (`X-Hub-Signature-256`) em TODOS os webhooks
- Usar o Supabase client com **service_role key** no backend (nunca anon key)
- Logging com contexto: `{ channel, contactId, messageId, action }`

### Frontend (Next.js)
- Usar **App Router** com Server Components onde possível
- Cliente Supabase: usar `createBrowserClient` no client e `createServerClient` no server
- Realtime: usar hooks customizados (`useRealtimeMessages`) com cleanup no unmount
- Estado do chat: manter mensagens em estado local + sync via Realtime
- UI responsiva: sidebar de conversas à esquerda, chat à direita (layout tipo WhatsApp Web)
- Mostrar badge com ícone do canal (WhatsApp verde, Instagram gradiente) em cada conversa

### Padrão de Mensagem Unificada
Ambos os canais devem ser normalizados para o mesmo formato interno:

```typescript
interface UnifiedInboundMessage {
  channelType: 'whatsapp' | 'instagram';
  channelId: string;
  contactExternalId: string;
  contactName?: string;
  contactProfilePic?: string;
  messageExternalId: string;
  contentType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'story_mention' | 'story_reply' | 'reaction';
  body?: string;
  mediaId?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  replyToExternalId?: string;
  timestamp: string;
  rawPayload: Record<string, any>;
}
```

---

## Fluxo dos Webhooks

### WhatsApp Cloud API
1. Meta envia POST para `/webhooks/whatsapp`
2. Verificar signature `X-Hub-Signature-256` com app secret
3. Parsear `entry[].changes[].value.messages[]` e `entry[].changes[].value.statuses[]`
4. Para **messages**: normalizar → upsert contact → find/create conversation → insert message → update conversation
5. Para **statuses**: atualizar status da mensagem (sent → delivered → read)
6. Se tiver mídia: baixar via Graph API (`GET /{media-id}`) e fazer upload para Supabase Storage

### Instagram Messaging API
1. Meta envia POST para `/webhooks/instagram`
2. Verificar signature `X-Hub-Signature-256` com app secret
3. Parsear `entry[].messaging[]`
4. Para **message**: normalizar → upsert contact → find/create conversation → insert message → update conversation
5. Para **message_reads**: atualizar status
6. Para **message_reactions**: inserir mensagem tipo 'reaction'
7. Se tiver attachments: baixar URL e salvar no Supabase Storage

---

## Envio de Mensagens

### WhatsApp
```
POST https://graph.facebook.com/v21.0/{phone_number_id}/messages
Headers: Authorization: Bearer {access_token}
Body: { messaging_product: "whatsapp", to: "{wa_id}", type: "text", text: { body: "..." } }
```

### Instagram
```
POST https://graph.facebook.com/v21.0/{page_id}/messages
Headers: Authorization: Bearer {page_access_token}
Body: { recipient: { id: "{ig_scoped_id}" }, message: { text: "..." } }
```

Sempre salvar a mensagem outbound no banco com `direction: 'outbound'` e o `external_id` retornado pela API.

---

## Variáveis de Ambiente

```env
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Meta App
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WABA_ID=

# Instagram
INSTAGRAM_PAGE_ID=
INSTAGRAM_PAGE_ACCESS_TOKEN=
INSTAGRAM_APP_ID=

# App
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
API_URL=http://localhost:3001
```

---

## Prioridades de Implementação

Siga esta ordem ao construir:

1. **Setup:** Inicializar projetos (API + Web), configurar Supabase, rodar migrations
2. **Webhooks:** Endpoint de verificação GET + recebimento POST do WhatsApp
3. **Processamento:** Normalização de mensagens + persistência no banco
4. **Realtime:** Supabase Realtime no frontend mostrando mensagens chegando
5. **Chat UI:** Interface de chat com lista de conversas e janela de mensagens
6. **Envio:** Permitir agente responder pelo dashboard (outbound WhatsApp)
7. **Instagram:** Adicionar webhook e envio do Instagram (mesma arquitetura)
8. **Mídia:** Upload/download de imagens, áudios, documentos
9. **Features:** Quick replies, notas internas, atribuição de agente, filtros
10. **Polish:** Notificações, indicadores de status, busca, performance

---

## Cuidados Importantes

- **WhatsApp tem janela de 24h:** Após 24h sem mensagem do contato, só é possível enviar templates pré-aprovados
- **Instagram tem janela de 24h** (Human Agent): Similar ao WhatsApp, com restrições após 24h
- **Rate limits da Meta:** Respeitar limites de envio (variam por tier do WhatsApp)
- **Webhook retry:** A Meta reenvia webhooks se não receber 200 em 20s — implementar idempotência com `external_id`
- **Supabase Realtime:** Habilitar apenas nas tabelas necessárias para não sobrecarregar
- **Tokens:** Usar System User Token (permanente) em vez de User Token (expira) para WhatsApp
- **Validação de assinatura:** NUNCA processar webhook sem validar `X-Hub-Signature-256`
