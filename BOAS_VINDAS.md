# Boas-vindas por WhatsApp

Avisa, pelo WhatsApp, quem acabou de comprar ("acesso liberado") e quem gerou
boleto ("pedido recebido").

## Por que existe

A maior reclamação dos alunos no chat é **não conseguir entrar na plataforma**:
14% dos atendimentos de alunos em 90 dias (jun–set/2026), 180 conversas, e
**5,3% das compras viram um chamado de acesso em até 7 dias**. O suporte
responde em 5 minutos (mediana) — o problema não é o atendimento, é o processo
que gera o chamado.

Em 99 conversas o aluno informou o e-mail; **88 já tinham conta**. A pessoa não
sabia qual e-mail usou, não achou o e-mail de boas-vindas ou não lembrava a
senha. Do lado de cá, o acesso era comunicado **uma única vez, só por e-mail, e
só quando a Guru mandava `approved`**. No boleto, nada era dito entre "gerado" e
"compensado" ("quanto tempo demora para liberar?").

O WhatsApp é onde o aluno está: um terço das vendas fecha com conversa no chat,
e o MonsterChat tem o telefone de 100% das compras (`guru_sales.contact_phone`).

## As duas mensagens

Saem por **template UTILITY aprovado**, como a régua de recuperação: fora da
janela de 24h a Meta recusa texto livre (#131047). Quando a pessoa responde, a
janela abre e o atendimento segue normal.

### `acesso_liberado` — a transação virou `approved`

```
Oi, {{1}}! Confirmamos o pagamento da sua matrícula no {{2}}.

O acesso à plataforma já está liberado para o e-mail {{3}}. As instruções de primeiro acesso foram enviadas para esse e-mail (confira também o spam). Se você já tinha cadastro, continua valendo o mesmo.

Se não conseguir entrar, responda esta mensagem.
```

`{{1}}` primeiro nome · `{{2}}` produto · `{{3}}` e-mail usado na compra.
Botão: **Entrar na plataforma** → `https://www.monsterstudy.com.br` (URL fixa).

Mostrar o e-mail resolve, sozinho, o caso mais comum ("não sei qual e-mail
usei") e expõe erro de digitação na hora (`hotmal.com`).

Sai **na hora**, pelo webhook da Guru (`/api/integrations/digital-guru`), logo
depois de gravar a venda. O cron é a rede de segurança.

### `pedido_recebido` — boleto gerado

```
Oi, {{1}}! Recebemos seu pedido de matrícula no {{2}} e o boleto foi gerado.

Assim que o pagamento compensar (até 3 dias úteis), o acesso é liberado automaticamente e você recebe aqui a confirmação com o passo a passo para entrar.

Se precisar da 2ª via do boleto, é só abrir o link abaixo.
```

Botão: **Ver boleto**, URL dinâmica `https://pagamento.monsterconcursos.com.br/invoice/{{1}}`
(o sufixo é o `transaction_id`, como na régua).

Só **boleto** (`payment_method = billet`). PIX compensa em minutos: a mensagem
chegaria depois do acesso.

### Regras da Meta aprendidas aqui

- A primeira versão do `acesso_liberado` foi **rejeitada na hora** com
  `INCORRECT_CATEGORY`. Tinha "login", "senha provisória", "Esqueci minha
  senha": o classificador lê isso como template de **AUTHENTICATION** (código
  de acesso), que tem formato próprio. Reescrito em torno de "acesso" e
  "e-mail cadastrado", sem essas palavras.
- Variável não abre nem fecha o corpo; descreva a transação, não convença
  (senão vira MARKETING). Igual à régua.

## Quem NÃO recebe

| Caso | Motivo gravado | Por quê |
|---|---|---|
| Parcela de assinatura (`invoice.type = 'cycle'` na Guru) | `parcela_de_assinatura` | A matrícula existe há meses; "acesso liberado" leria como erro |
| Já era aluno do mesmo produto (aprovado há mais de 1 dia antes desta) | `ja_era_aluno` | Renovação ou recompra, não é primeiro acesso |
| Produtos da Fagenius: Tecnólogo, Sequencial, Direito (e o COMBO MG, que contém "Sequencial") | `produto_ignorado` | Matrícula pela secretaria e outra plataforma (`tec.fagenius.com.br`); "entre no Monster Study" seria errado |
| Lançamentos manuais ("Alteração…", "Taxa…") | `produto_ignorado` | Não são matrícula |
| Guru fora do ar na consulta de parcela | (reserva desfeita) | Não decide sem saber; a próxima rodada tenta |
| Mesma pessoa, mesmo tipo, nas últimas 24h | (pulado sem registro) | Dois cursos no mesmo dia não viram duas mensagens iguais |

`guru_sales` é um **log**: a mesma transação repete com status diferentes e às
vezes com o mesmo `sold_at`. A leitura é por `created_at` da linha, e o
"quando" de cada aviso é a data em que a linha decisiva foi gravada — no boleto
pago dois dias depois, o `sold_at` continua sendo o do pedido.

## Como ligar

1. Confirmar no Gerenciador da Meta que `acesso_liberado` e `pedido_recebido`
   estão **APPROVED** (ou `GET /api/integrations/whatsapp/templates`).
2. Ver a fila sem mandar nada:
   ```
   GET /api/pagamentos/cron/boas-vindas?simular=1
   ```
   Cada candidato traz `pularPor` (nulo = enviaria). A simulação não consulta a
   Guru; o filtro de parcela só aparece no envio real.
3. Ligar **marcando o início**, para não avisar em lote quem comprou há 1–3
   dias (na simulação de 22/09/2026 eram 77 pessoas):
   ```sql
   update boas_vindas_config set ativo = true, iniciado_em = now();
   ```

Depois disso o webhook manda na hora e o cron (`40 * * * *`) cobre o que ficou
fora do horário ou falhou.

## Ajustes

Tudo em `boas_vindas_config`, sem deploy:

| Coluna | Para quê |
|---|---|
| `ativo` | o interruptor |
| `iniciado_em` | só transações gravadas a partir daqui |
| `template_acesso` / `template_pedido` | nulo = não manda aquele tipo |
| `hora_inicio` / `hora_fim` | 8h–22h de Brasília; fora disso o cron da manhã manda |
| `janela_dias` | idade máxima da transação (3 dias) |
| `historico_dias` | janela para saber se já era aluno (365) |
| `produtos_ignorados` | trechos de nome que não entram |
| `max_por_execucao` | teto por rodada (40) |

## Onde olhar o resultado

```sql
select date_trunc('day', created_at) as dia, tipo, status, motivo, count(*)
from boas_vindas_envios
group by 1, 2, 3, 4
order by 1 desc;
```

A mensagem aparece na conversa do contato como qualquer outra, com
`via: boas_vindas` nos metadados, então a equipe vê o que a pessoa recebeu.

**A medida que importa**: chamados de acesso por 100 compras (linha de base
5,3 em jun–set/2026) e por semana (~14). Ver
`ceo/diagnosticos/2026-09-22_monsterchat_reclamacao_acesso.md`.

## Um bug que apareceu no caminho

Na simulação local, a configuração mudava no banco e a rota continuava lendo o
valor antigo: o **Next 14 guarda no Data Cache as respostas GET do `fetch`**,
inclusive as do PostgREST — e um `select` sem filtro variável tem sempre a
mesma URL. `force-dynamic` na rota não bastou. O cliente `supabaseAdmin`
(`lib/api/supabase.ts`) passou a usar `cache: 'no-store'` em toda chamada, o que
vale também para a régua de recuperação: uma régua que não vê `ativo = false`
não é aceitável.

## Link de acesso direto (`/a/<codigo>`)

O público tem dificuldade com e-mail. Então a mensagem do WhatsApp passa a
**ser** o acesso: um link curto e nosso que, no clique, pede ao Supabase da
plataforma um magic link para o e-mail da compra e redireciona. A pessoa cai
no `monsterstudy.com.br` logada, numa tela que pede para definir a senha, e
entra no curso. Testado em 22/09/2026 com a conta de teste, sem nenhuma
mudança no front do Monster Study. O e-mail com login e senha **continua
saindo** como antes; o link é um complemento.

Onde aparece:

- **Boas-vindas**: com `acesso_com_link = true` e `template_acesso =
  'acesso_liberado_link'` (mesmo texto do aprovado, botão de URL dinâmica
  `https://chatmonster.monsterconcursos.com.br/a/{{1}}`), o botão "Entrar na
  plataforma" já entra logado. Nasce desligado: o template está em análise.
- **Atendente**: botão **Enviar link de acesso** no painel do contato (ao lado
  de "Verificar acesso" e "Liberar acesso"). Manda um texto na conversa com o
  link; exige e-mail no cadastro e conta existente na plataforma. Texto livre
  só passa dentro da janela de 24h — fora dela a resposta explica e pede um
  "oi" da pessoa.

Segurança, e por que dois níveis de link:

| | |
|---|---|
| **O que vai no WhatsApp** | `/a/<codigo>`: 128 bits aleatórios, nunca sequencial. Vai só para o número da compra, o mesmo canal da fatura |
| **Validade** | 7 dias e 5 usos (`acesso_links.expira_em`, `max_usos`); `revogado = true` cancela na hora |
| **O login de verdade** | O magic link do Supabase é gerado **só no clique** e vale 1 hora. Ninguém fica com um link de login eterno guardado no celular |
| **Conta inexistente** | O clique confere a conta antes de pedir o link. Descoberto no teste: o `generate_link` de magiclink **cria o usuário** quando o e-mail não existe — sem essa checagem, um link virava cadastro vazio na plataforma |
| **Registro** | Cada clique grava `usos` e `ultimo_uso_em`; erros ficam em `ultimo_erro`. Dá para ver quem entrou e quem nunca abriu |
| **Página de erro** | Link vencido, esgotado ou conta ainda não liberada mostram uma página curta em português com botão "Pedir novo link no WhatsApp" |

Depende de `PLATFORM_SUPABASE_URL` e `PLATFORM_SUPABASE_SERVICE_KEY` (já usados
por "Verificar acesso" e "Liberar acesso") e de `https://www.monsterstudy.com.br/**`
na allow-list de redirect do Auth da plataforma (já estava).

Onde olhar:

```sql
select origem, count(*) filter (where usos > 0) as abertos, count(*) as gerados
from acesso_links group by 1;
```

## O que fica para depois

- **"Entrar com WhatsApp"** na tela de login da plataforma: código de 6
  dígitos por template AUTHENTICATION, para quem perdeu a senha meses depois.
- A IA do MonsterChat sugerir o botão de link quando reconhecer "não consigo
  acessar".
- **Redefinição de senha**: o `LoginModal` do Questões fixa o redirect em
  `monsterquestoes.com.br` mesmo para quem estuda no `monsterstudy.com.br`.
- Fagenius: mensagem própria, com o portal certo e o passo da secretaria.
