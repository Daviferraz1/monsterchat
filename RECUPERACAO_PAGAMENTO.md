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

### 1. Criar os dois templates na Meta

Gerenciador do WhatsApp → **Modelos de mensagem** → Criar modelo. São dois: o
segundo lembrete tem texto próprio, porque repetir a mesma mensagem três dias
depois lê como robô quebrado, e o momento é outro — a pergunta deixa de ser
"você esqueceu?" e vira "ainda quer?".

Em ambos: **Categoria** Utilidade · **Idioma** Português (BR) · sem cabeçalho e
sem rodapé.

São três: dois para quem tem cobrança gerada (esses levam o **link de pagamento**
num botão) e um para checkout abandonado, que não tem o que pagar.

#### 1º lembrete — `pagamento_pendente`

```
Oi, {{1}}! Sua matrícula no {{2}} ficou pendente: o pagamento de R$ {{3}} não foi concluído.

É só abrir o link abaixo para pagar. Se o prazo venceu ou você preferir outra forma, responda aqui que a gente resolve.
```

Exemplos das variáveis: `{{1}}` Danilson · `{{2}}` Tecnólogo em Gestão Pública ·
`{{3}}` 197,00

**Botões:**

1. **Acessar pagamento** — tipo `Visitar site`, opção **URL dinâmica**
   - URL: `https://pagamento.monsterconcursos.com.br/invoice/{{1}}`
   - Exemplo para `{{1}}`: `a2cd51fe-ad02-4346-b279-023bfac7405b`
2. **Falar com a secretaria** — resposta rápida

#### 2º lembrete — `pagamento_pendente_final`

```
{{1}}, sua vaga no {{2}} continua reservada, mas o prazo do pagamento de R$ {{3}} está acabando.

O link abaixo continua valendo. Se mudou de ideia, é só avisar — a gente encerra e não te incomoda mais.
```

Exemplos das variáveis: os mesmos. Mesmos dois botões, com a resposta rápida
escrita como **Mudei de ideia**.

#### Checkout abandonado — `matricula_abandonada`

Sem link: aqui a pessoa nunca chegou a gerar cobrança.

```
Oi, {{1}}! Vi que você começou a matrícula no {{2}} e não chegou a concluir.

Se ficou alguma dúvida sobre o curso ou sobre o pagamento de R$ {{3}}, responda aqui que a gente te ajuda a finalizar.
```

Exemplos das variáveis: os mesmos.

Botão de resposta rápida: **Quero finalizar a matrícula**

### Por que o texto é esse

- **"não foi concluído"**, e não "não foi confirmado": dois terços da fila são
  **checkouts abandonados** — gente que chegou ao pagamento e fechou a página,
  sem nunca gerar boleto. "Não confirmado" daria a entender que a pessoa pagou e
  o sistema não viu.
- **Nenhum desconto.** Além de a Meta reclassificar para MARKETING (mais caro e
  com mais recusa), quem ia pagar o preço cheio aprende a esperar o lembrete.
- **A saída explícita no 2º** ("se mudou de ideia, é só avisar") existe para
  proteger o número: quem não quer responde em vez de bloquear, e bloqueio é o
  que derruba a qualidade da linha no WhatsApp.
- **Os botões** fazem a pessoa responder com um toque — e a resposta é o que abre
  a janela de 24h para a equipe conversar em texto livre.

### 2. Apontar a configuração para o template

Uma linha na tabela `recuperacao_config`:

```sql
update recuperacao_config set
  template_nome = 'pagamento_pendente',
  template_nome_etapa2 = 'pagamento_pendente_final',
  template_abandonado = 'matricula_abandonada',
  template_idioma = 'pt_BR',
  ativo = true;
```

Os dois últimos são opcionais: `template_nome_etapa2` nulo faz o segundo
lembrete repetir o texto do primeiro, e `template_abandonado` nulo faz a régua
**ignorar os abandonados** em vez de mandar um link que não paga nada.

### Sobre o link de pagamento

A fatura da Guru fica sempre em `<base>/invoice/<transaction_id>` — conferido em
27 de 27 cobranças pendentes. Como `guru_sales` já guarda o `transaction_id`, o
link sai sem consulta nova: vira o sufixo do botão de URL dinâmica.

Para `billet_printed` e `waiting_payment` essa página abre o boleto ou o PIX. Para
`abandoned` ela abre com o carimbo "Abandonada" e nenhum botão de pagar — por
isso o template do abandonado não tem link.

A página da fatura é pública e mostra nome, CPF e endereço do comprador. O link
só vai para o WhatsApp do próprio comprador, mas quem receber o link encaminhado
vê esses dados.

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
