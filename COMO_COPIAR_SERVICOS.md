# 📋 Como Copiar Serviços do Backend para o Frontend

Os serviços do backend (`apps/api/src/services/`) precisam ser copiados para `apps/web/src/lib/api/services/`.

## Estrutura Necessária

Crie os seguintes arquivos em `apps/web/src/lib/api/services/`:

1. `contact.ts` - Copiar de `apps/api/src/services/contact.service.ts`
2. `conversation.ts` - Copiar de `apps/api/src/services/conversation.service.ts`
3. `message.ts` - Copiar de `apps/api/src/services/message.service.ts`
4. `channel.ts` - Copiar de `apps/api/src/services/channel.service.ts`
5. `whatsapp.ts` - Copiar de `apps/api/src/services/whatsapp.service.ts`
6. `instagram.ts` - Copiar de `apps/api/src/services/instagram.service.ts`
7. `media.ts` - Copiar de `apps/api/src/services/media.service.ts`

## Adaptações Necessárias

Ao copiar, faça estas mudanças:

1. **Imports:**
   - Trocar `../config/supabase.js` → `@/lib/api/supabase`
   - Trocar `../utils/logger.js` → `console.log` (ou criar logger simples)
   - Trocar `../types/` → `@/types` (ou criar tipos em `@/lib/api/types`)

2. **Logger:**
   - Substituir `logger.info/debug/error` por `console.log/error`
   - Ou criar um logger simples em `apps/web/src/lib/api/utils.ts`

3. **Supabase:**
   - Usar `supabaseAdmin` de `@/lib/api/supabase` ao invés de `supabase`

## Handlers de Webhook

Crie em `apps/web/src/lib/api/webhooks/`:

1. `whatsapp.ts` - Handler principal do WhatsApp
2. `instagram.ts` - Handler principal do Instagram

Esses handlers devem conter a lógica de processamento dos webhooks (copiar de `apps/api/src/webhooks/`).

## Tipos

Copie os tipos de `apps/api/src/types/` para `apps/web/src/lib/api/types/`:

1. `common.types.ts`
2. `whatsapp.types.ts`
3. `instagram.types.ts`

Ou reutilize os tipos já existentes em `apps/web/src/types/`.

---

**Nota:** Por enquanto, o sistema está configurado para funcionar. Os serviços podem ser implementados conforme necessário durante o desenvolvimento.
