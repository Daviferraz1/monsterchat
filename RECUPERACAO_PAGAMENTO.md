# Régua de recuperação de boleto e PIX

Lembra, pelo WhatsApp, quem gerou uma cobrança e não pagou.

## Por que existe

Em 30 dias, 705 cobranças foram geradas na Guru e 392 foram pagas. As 293 que
ficaram pelo caminho somam **R$ 130.618**. Só boleto e PIX não pagos são
R$ 58 mil. É gente que já escolheu o produto, já viu o preço e já digitou o CPF
— não falta anúncio, falta lembrete.

Olhando os últimos 14 dias: **144 transações pendentes, R$ 52.316**, e todas com
contato já cadastrado no MonsterChat.

## O ponto que decide o desenho: tem que ser template

Dos 144 contatos pendentes, **nenhum** tinha falado no WhatsApp nas últimas 24
horas. Fora dessa janela a Meta recusa texto livre com o erro `(#131047)`. Então
a primeira mensagem sai obrigatoriamente como **template aprovado**.

Isso não é contorno, é o caminho certo: a categoria **UTILITY** existe
exatamente para isso — aviso sobre uma transação que a pessoa iniciou. É barata
e aprova rápido. Quando ela responde, a janela de 24h abre e o atendimento
segue normal, em texto livre, com a equipe ou com a IA.

## O que ligar, na ordem

### 1. Criar o template na Meta

Gerenciador do WhatsApp → **Modelos de mensagem** → Criar modelo.

- **Nome:** `pagamento_pendente`
- **Categoria:** Utilidade
- **Idioma:** Português (BR)

**Corpo:**

```
Oi, {{1}}! Sua matrícula no {{2}} ficou pendente: o pagamento de R$ {{3}} não foi concluído.

Se o prazo venceu ou você preferir outra forma de pagar, a gente gera um link novo agora mesmo. É só responder aqui.
```

> "não foi concluído", e não "não foi confirmado", porque dois terços da fila são
> **checkouts abandonados** — gente que chegou ao pagamento e fechou a página, sem
> nunca gerar boleto. "Não confirmado" daria a entender que a pessoa pagou e o
> sistema não viu.

**Exemplos** (a Meta exige um valor de exemplo para cada variável):
`{{1}}` Danilson · `{{2}}` Tecnólogo em Gestão Pública · `{{3}}` 197,00

**Botão** (opcional, recomendado) — Resposta rápida: `Quero concluir a matrícula`.
O botão é o que faz a pessoa responder com um toque; a resposta abre a janela de
24h e a conversa cai na caixa de entrada como qualquer outra.

> Não prometa desconto no template. Além de a Meta reclassificar para MARKETING
> (mais caro e com mais recusa), quem ia pagar o preço cheio aprende a esperar o
> lembrete.

### 2. Apontar a configuração para o template

Uma linha na tabela `recuperacao_config`:

```sql
update recuperacao_config set
  template_nome = 'pagamento_pendente',
  template_idioma = 'pt_BR',
  ativo = true;
```

### 3. Conferir a fila antes de ligar

```
GET /api/pagamentos/cron/recuperacao?simular=1
```

Devolve quem receberia agora e quanto está parado, **sem enviar nada**. Vale
olhar essa lista uma vez antes de virar `ativo = true`.

## Como funciona

| | |
|---|---|
| **Quem entra** | Última linha da transação em `guru_sales` com status `abandoned`, `billet_printed` ou `waiting_payment`, e nenhuma linha em `approved` ou `refunded` |
| **1º lembrete** | 20 horas após a cobrança — cai no dia seguinte, ainda dentro do prazo do boleto |
| **2º lembrete** | 68 horas — na véspera do vencimento |
| **Horário** | Das 9h às 20h de Brasília. Fora disso a execução devolve o motivo e não manda nada |
| **Teto** | 40 envios por execução, para um disparo em massa acidental não queimar o número |
| **Janela** | Só cobranças dos últimos 7 dias. Lembrar de um boleto de 20 dias atrás é ruído |
| **Repetição** | A unique `(transaction_id, etapa)` é reservada antes do envio: ninguém recebe o mesmo lembrete duas vezes, nem com dois crons simultâneos |
| **Quem pagou** | Sai da fila sozinho: o webhook da Guru grava a linha `approved` e a transação deixa de ser pendente |

A mensagem enviada aparece na conversa do contato como qualquer outra, marcada
com `via: recuperacao_pagamento` nos metadados, então a equipe vê o histórico
antes de responder.

## Ajustes

Tudo em `recuperacao_config` — sem deploy:

| Coluna | Para quê |
|---|---|
| `ativo` | o interruptor |
| `etapa1_horas` / `etapa2_horas` | quando cada lembrete dispara |
| `hora_inicio` / `hora_fim` | faixa de horário (Brasília) |
| `max_por_execucao` | teto por rodada |
| `janela_dias` | idade máxima da cobrança |
| `produtos_ignorados` | trechos de nome de produto que não entram (ex.: `{"Taxa de ativação"}`) |

## Onde olhar o resultado

```sql
select date_trunc('day', created_at) as dia,
       etapa, status, count(*), sum(valor) as valor_abordado
from recuperacao_envios
group by 1, 2, 3
order by 1 desc;
```

Para medir recuperação de verdade, cruze `recuperacao_envios.transaction_id`
com as linhas `approved` de `guru_sales` posteriores ao envio.
