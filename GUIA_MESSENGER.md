# Facebook Messenger (mensagens da Página)

O MonsterChat recebe e responde as mensagens da Página do Facebook como já faz com o
direct do Instagram. No código, o canal se chama `facebook`.

## 1. Conferir a permissão `pages_messaging` (faça isso primeiro)

Em [developers.facebook.com](https://developers.facebook.com) → seu app → **Análise do app →
Permissões e recursos**, procure **pages_messaging**:

- **Acesso Avançado**: funciona com qualquer pessoa que escrever para a Página.
- **Acesso Padrão**: só conversa com quem tem função no app (administrador, desenvolvedor
  ou testador). Cliente real escreve e a resposta falha com erro (#200) ou (#230).

Se estiver em Acesso Padrão, clique em **Solicitar acesso avançado**. A Meta pede
Verificação da Empresa concluída e um vídeo mostrando a mensagem chegando e sendo
respondida no MonsterChat. Enquanto a análise não sai, dá para testar com contas
adicionadas em **Funções do app**.

Também são usadas `pages_manage_metadata` (assinar o webhook da Página) e
`pages_show_list` (derivar o token da Página a partir de um usuário do sistema).

## 2. Adicionar o produto Messenger e o webhook

1. No app, **Adicionar produto → Messenger → Configurar**.
2. Em **Messenger → Configurações da API do Messenger → Webhooks**, preencha:
   - **URL de callback**: `https://SEU-DOMINIO/api/webhooks/messenger`
     (o mesmo domínio do webhook do Instagram)
   - **Verificar token**: o valor de `META_WEBHOOK_VERIFY_TOKEN` (o mesmo dos outros webhooks)
3. Em **Gerar tokens de acesso**, conecte a Página e clique em **Adicionar assinaturas**.
   Marque:
   - ✅ `messages` — mensagens recebidas
   - ✅ `message_echoes` — respostas dadas fora do MonsterChat (Meta Business Suite, celular)
   - `message_reactions` — reações (opcional)
   - `messaging_referrals` — origem de anúncio ou link m.me (opcional)

A assinatura do webhook é conferida com `META_APP_SECRET` ou `INSTAGRAM_APP_SECRET`,
o que bater. Se o Messenger ficar em um app diferente desses dois, a chave secreta dele
precisa estar em uma dessas variáveis na Vercel.

## 3. Token da Página

Na mesma tela (**Gerar tokens de acesso**), clique em **Gerar** ao lado da Página e copie
o **Token de Acesso da Página** (começa com `EAA...`).

Alternativa que não expira: token de **usuário do sistema** do Business Manager com
acesso à Página e as permissões `pages_messaging` e `pages_show_list`. O MonsterChat
troca esse token pelo da Página sozinho.

## 4. Cadastrar o canal no MonsterChat

Antes, a migração `supabase/migrations/064_facebook_messenger_channel.sql` precisa estar
aplicada no banco (sem ela o cadastro falha no CHECK de `channels.type`).

Em **Configurações → Canais → Novo canal**:

| Campo | Valor |
|---|---|
| Tipo | Facebook Messenger (Página) |
| ID da Página do Facebook | o ID da Página (Meta Business Suite → Configurações → Contas → Páginas) |
| Token de acesso | o Token de Acesso da Página do passo 3 |

O mesmo ID serve para receber e enviar. Pode ser a mesma Página já usada no canal do
Instagram: são canais separados.

## 5. Testar

Com uma conta que tenha função no app, mande uma mensagem para a Página. Ela deve
aparecer no inbox com o selo azul do Facebook. Responda pelo MonsterChat e confira no
Messenger.

## Como funciona e limites

- **Janela de 24 horas**: a Página só responde até 24h depois da última mensagem da
  pessoa. Depois disso o envio é recusado até ela escrever de novo.
- **Texto**: até 2000 caracteres por mensagem.
- **Anexos**: foto, áudio, vídeo e arquivo, até 25 MB. A legenda vai como mensagem separada.
- **Piloto automático**: atende o Messenger com as mesmas regras do WhatsApp e do Instagram.
- **Links**: saem com `utm_source=monsterchat` e `utm_medium=facebook`.
- **Mensagem de ausência** do Meta Business Suite: fica no histórico como automática e não
  conta como resposta da equipe.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Mensagem não chega no inbox | Página sem assinatura em `messages`, ou canal não cadastrado. O log mostra `[Messenger Webhook] Canal não encontrado` com o ID esperado |
| Webhook responde 401 | A chave secreta do app do Messenger não é nenhuma das duas configuradas |
| Recebe mas não envia, erro (#200) ou (#230) | `pages_messaging` em Acesso Padrão (passo 1) |
| "must be called with a Page Access Token" | O token colado não é o da Página |
| Resposta dada pelo Business Suite não aparece | Falta assinar `message_echoes` |

Documentação: [Messenger Platform](https://developers.facebook.com/docs/messenger-platform)
