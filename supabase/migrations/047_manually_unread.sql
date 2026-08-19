-- 047_manually_unread.sql
-- "Marcar como não lida": o atendente sinaliza que precisa voltar na conversa.
--
-- Por que uma coluna nova em vez de mexer em unread_count:
--
-- unread_count conta mensagem que chegou e ninguém abriu — é um fato sobre o
-- aluno. Marcar como não lida é uma INTENÇÃO do atendente ("li, não resolvi,
-- volto depois"). Empilhar as duas na mesma coluna faria a marca sumir sozinha
-- na próxima mensagem recebida (o webhook soma +1 e depois o chat zera tudo),
-- que é exatamente quando ela mais precisa estar lá.
--
-- Separadas, a marca sobrevive a mensagem nova, e some só quando o atendente
-- abrir a conversa de novo — que é o momento em que ele voltou, como pedido.

alter table public.conversations
  add column if not exists manually_unread boolean not null default false;

-- Índice parcial: a lista filtra por "marcadas", e elas são poucas por definição.
create index if not exists idx_conversations_manually_unread
  on public.conversations (last_message_at desc)
  where manually_unread;

comment on column public.conversations.manually_unread is
  'Marcada pelo atendente para voltar depois. Independente de unread_count: sobrevive a mensagem nova e só é limpa quando ele reabre a conversa.';
