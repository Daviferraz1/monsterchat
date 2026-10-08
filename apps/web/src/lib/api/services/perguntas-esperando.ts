/**
 * Conversas em que o aluno fez uma pergunta de verdade e ninguém respondeu.
 *
 * A equipe atende muita conversa ao mesmo tempo e a dúvida real se perdia no meio
 * de "obrigado", "ok" e figurinha (em 08/10/2026: 49 perguntas esperando, contra
 * 107 conversas que só tinham fechamento). Alimenta o selo "⏳ 3h sem resposta" e
 * o filtro "Pergunta sem resposta" da lista.
 *
 * O cálculo varre as conversas abertas dos últimos 14 dias; o resultado fica 90 s
 * em ia_settings, para todas as telas abertas lerem a mesma coisa sem refazer.
 */
import { supabaseAdmin } from '../supabase';
import { temPerguntaEmAberto, type MensagemAluno } from '@/lib/pergunta-em-aberto';

const CHAVE = 'perguntas_esperando';
const VALIDADE_MS = 90 * 1000;
const JANELA_DIAS = 14;
const MINIMO_MIN = 15; // abaixo disso é só o tempo normal de resposta

export interface PerguntaEsperando {
  conversationId: string;
  /** Primeira mensagem do aluno sem resposta (ISO). */
  desde: string;
  trecho: string;
}

interface Msg {
  conversation_id: string;
  direction: string;
  content_type: string;
  body: string | null;
  transcricao: string | null;
  created_at: string;
}

async function calcular(): Promise<PerguntaEsperando[]> {
  const desde = new Date(Date.now() - JANELA_DIAS * 86400 * 1000).toISOString();
  const { data: convs } = await supabaseAdmin
    .from('conversations')
    .select('id, last_message_at, last_agent_reply_at, channel:channels(type)')
    .neq('status', 'closed')
    .gte('last_message_at', desde)
    .limit(3000);

  // Candidatas: houve mensagem depois da última resposta de atendente. Mensagem de
  // robô também mexe em last_message_at; as mensagens confirmam abaixo.
  const candidatas = (convs ?? []).filter((c) => {
    const tipo = (c.channel as { type?: string } | null)?.type;
    if (tipo === 'guru') return false;
    return !c.last_agent_reply_at || new Date(c.last_message_at) > new Date(c.last_agent_reply_at);
  });

  const saida: PerguntaEsperando[] = [];
  for (let i = 0; i < candidatas.length; i += 80) {
    const ids = candidatas.slice(i, i + 80).map((c) => c.id);
    const { data } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, direction, content_type, body, transcricao:metadata->>transcricao, created_at')
      .in('conversation_id', ids)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(5000);
    const porConversa = new Map<string, Msg[]>();
    for (const m of (data ?? []) as Msg[]) {
      const l = porConversa.get(m.conversation_id) ?? [];
      if (l.length < 12) l.push(m);
      porConversa.set(m.conversation_id, l);
    }
    for (const [conversationId, msgs] of porConversa) {
      // msgs vem da mais nova para a mais antiga: pega o trecho do aluno até nossa última resposta.
      const pendentes: Msg[] = [];
      for (const m of msgs) {
        if (m.direction !== 'inbound') break;
        pendentes.push(m);
      }
      if (!pendentes.length) continue;
      pendentes.reverse();
      const primeira = pendentes[0].created_at;
      if (Date.now() - new Date(primeira).getTime() < MINIMO_MIN * 60 * 1000) continue;
      const doAluno: MensagemAluno[] = pendentes.map((m) => ({
        tipo: m.content_type,
        texto: m.content_type === 'audio' ? m.transcricao : m.body,
      }));
      if (!temPerguntaEmAberto(doAluno)) continue;
      const trecho = doAluno
        .map((m) => (m.texto ? m.texto.replace(/\s+/g, ' ') : `[${m.tipo}]`))
        .join(' / ')
        .slice(0, 160);
      saida.push({ conversationId, desde: primeira, trecho });
    }
  }
  return saida.sort((a, b) => a.desde.localeCompare(b.desde));
}

export async function perguntasEsperando(): Promise<PerguntaEsperando[]> {
  const { data } = await supabaseAdmin.from('ia_settings').select('value').eq('key', CHAVE).maybeSingle();
  const salvo = data?.value as { gerado_em?: string; itens?: PerguntaEsperando[] } | null;
  if (salvo?.itens && salvo.gerado_em && Date.now() - new Date(salvo.gerado_em).getTime() < VALIDADE_MS) {
    return salvo.itens;
  }
  const itens = await calcular();
  await supabaseAdmin
    .from('ia_settings')
    .upsert({ key: CHAVE, value: { gerado_em: new Date().toISOString(), itens } }, { onConflict: 'key' });
  return itens;
}
