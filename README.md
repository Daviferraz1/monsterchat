# MonsterChat

Sistema de inbox unificado para WhatsApp Business Cloud API e Instagram Messaging API.

## Stack Tecnológica

- **Backend:** Node.js 20+ com Express.js e TypeScript
- **Frontend:** Next.js 14+ (App Router) com TypeScript
- **Banco de Dados:** Supabase (PostgreSQL + Realtime + Auth + Storage)
- **UI:** Tailwind CSS + shadcn/ui

## Estrutura do Projeto

```
monsterchat/
├── apps/
│   ├── api/          # Backend Express + TypeScript
│   └── web/          # Frontend Next.js
├── packages/
│   └── shared/       # Tipos e utilidades compartilhadas
└── supabase/         # Migrations e configurações do Supabase
```

## Setup

1. Instalar dependências:
```bash
npm install
```

2. Configurar variáveis de ambiente:
```bash
cp .env.example .env
# Preencher com suas credenciais do Supabase e Meta
```

3. Rodar migrations do Supabase:
```bash
cd supabase
supabase db push
```

4. Iniciar desenvolvimento:
```bash
npm run dev
```

## Desenvolvimento

- Backend API: http://localhost:3001
- Frontend Web: http://localhost:3000
