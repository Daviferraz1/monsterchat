/**
 * Autocompletar da caixa de mensagem: enquanto o atendente digita, a IA sugere
 * a continuação (texto cinza depois do cursor) e o Tab aceita.
 *
 * O texto já digitado vai como início da resposta do modelo (prefill): ele
 * continua exatamente de onde o atendente parou, no tom dele, em vez de
 * reescrever a frase. Haiku, poucos tokens e contexto curto, porque roda a cada
 * pausa na digitação.
 */
import Anthropic from '@anthropic-ai/sdk';
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';
import { getOperatorStyleBlock } from './operator-style';
import { lerRespostasEquipe } from './mensagens-rapidas';

const MODEL = 'claude-haiku-4-5-20251001';

// Cada pausa na digitação pediria a conversa de novo; ela muda pouco em segundos.
const cacheConversa = new Map<string, { em: number; transcript: string }>();
const CACHE_MS = 30 * 1000;

async function transcript(conversationId: string): Promise<string> {
  const c = cacheConversa.get(conversationId);
  if (c && Date.now() - c.em < CACHE_MS) return c.transcript;
  const { data } = await supabaseAdmin
    .from('messages')
    .select('direction, body, content_type, metadata->>transcricao')
    .eq('conversation_id', conversationId)
    .in('content_type', ['text', 'audio'])
    .order('created_at', { ascending: false })
    .limit(12);
  const linhas = ((data ?? []) as Array<{ direction: string; body: string | null; content_type: string; transcricao: string | null }>)
    .map((m) => {
      const corpo = m.content_type === 'audio' ? (m.transcricao ? `(áudio) ${m.transcricao}` : '') : (m.body ?? '');
      return corpo.trim() ? `${m.direction === 'inbound' ? 'ALUNO' : 'ATENDENTE'}: ${corpo.trim().slice(0, 800)}` : '';
    })
    .filter(Boolean)
    .reverse();
  const t = linhas.join('\n');
  cacheConversa.set(conversationId, { em: Date.now(), transcript: t });
  if (cacheConversa.size > 500) cacheConversa.delete(cacheConversa.keys().next().value!);
  return t;
}

export async function completarMensagem(conversationId: string, digitado: string): Promise<string> {
  if (!apiEnv.ANTHROPIC_API_KEY) return '';
  const [conversa, estilo, padrao] = await Promise.all([
    transcript(conversationId),
    getOperatorStyleBlock().catch(() => ''),
    lerRespostasEquipe().catch(() => []),
  ]);
  // As respostas padrão da equipe são a fonte de fatos: sem elas o modelo completou
  // "a dispensa de" com "TCC, você se forma mais rápido", que é falso.
  const fatos = padrao.map((r) => `- ${r.titulo}: ${r.texto.replace(/\{nome\},?\s*/g, '').slice(0, 600)}`).join('\n');

  const system = `Você completa a mensagem que um atendente da Monster Concursos (cursos preparatórios para concursos) e da Fagenius (graduação EAD) está digitando no WhatsApp para um aluno.

Regras:
- Continue o texto exatamente de onde ele parou, no mesmo tom (português do Brasil, informal e cordial, frases curtas).
- Prefira completar só a frase em andamento; no máximo uma frase a mais. Não comece outro assunto.
- Afirmação sobre curso, preço, link, prazo, data, desconto, dispensa, requisito, diploma ou acesso: só se estiver escrita na conversa ou nas respostas padrão abaixo, com o mesmo sentido. Fora disso, NÃO afirme: pare antes (devolva só o que for seguro, mesmo que seja nada).
- Se a mensagem já parece completa, não acrescente nada.
${fatos ? `\nRespostas padrão da equipe (fatos corretos):\n${fatos}\n` : ''}
${estilo ? `\nJeito de escrever da equipe:\n${estilo}\n` : ''}
Conversa até agora:
${conversa || '(sem mensagens anteriores)'}`;

  // A API recusa prefill terminando em espaço: tira e devolve na emenda.
  const base = digitado.replace(/\s+$/, '');
  const terminouComEspaco = base.length < digitado.length;

  const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 60,
    temperature: 0.3,
    system,
    stop_sequences: ['\nALUNO:', '\nATENDENTE:'],
    messages: [
      { role: 'user', content: 'Complete a mensagem do atendente.' },
      { role: 'assistant', content: base },
    ],
  });
  let cont = r.content[0]?.type === 'text' ? r.content[0].text : '';
  // Cortada no limite de tokens: fica só até a última frase ou palavra inteira.
  if (r.stop_reason === 'max_tokens') {
    const fim = Math.max(cont.lastIndexOf('. '), cont.lastIndexOf('! '), cont.lastIndexOf('? '));
    cont = fim > 10 ? cont.slice(0, fim + 1) : cont.replace(/\s+\S*$/, '');
  }
  cont = cont.replace(/\n{2,}[\s\S]*$/, '').replace(/\s+$/, '');
  if (terminouComEspaco) cont = cont.replace(/^\s+/, '');
  return cont;
}
