/**
 * O aluno deixou uma dúvida de verdade sem resposta, ou só fechou a conversa?
 *
 * Usado no selo "⏳ sem resposta" e no filtro "Pergunta sem resposta" da lista.
 * O filtro "Não respondido" já existia, mas misturava a dúvida real com "obrigado",
 * "ok", figurinha e reação, que são a maioria (out/2026), e a dúvida se perdia.
 *
 * Recebe as mensagens do aluno desde a última resposta nossa. Basta uma delas ser
 * pergunta para a conversa contar.
 */

export interface MensagemAluno {
  tipo: string; // content_type: text, audio, image, reaction, sticker…
  texto: string | null; // corpo, ou a transcrição do áudio
}

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Agradecimento, ok, elogio, despedida: fecha o assunto. */
const FECHAMENTO =
  /\b(obrigad[oa]s?|brigad[oa]|obg|vlw|valeu|grat[oa]|agradec\w*|ok+|okay|blz|beleza|certo|entendi|intendi|perfeito|otimo|show|top|combinado|joia|amem|tmj|deus abencoe|cordialmente|ate mais|abracos?|bom dia|boa tarde|boa noite|ficarei|pode deixar|ta bom|ta bem|ah sim|tudo certo|deu certo|consegui)\b/;

/** Pedido, problema ou pergunta mesmo sem "?". */
const PEDIDO =
  /\b(como|qual|quais|quando|onde|quanto|quantos|quantas|porque|por que|pq|sera que|alguem|tem como|da pra|da para|pode me|poderia|gostaria|queria|quero|preciso|teria|existe|aceita|serve|funciona|tem algum|tem alguma|vcs tem|voces tem|aplicativo|app|cnpj|nao consigo|nao estou conseguindo|nao abre|nao chegou|nao recebi|nao aparece|erro|problema|ajuda|duvida|link|acesso|senha|login|boleto|pix|pagamento|pagar|valor|preco|desconto|matricula|cancelar|reembolso|certificado|suporte)\b/;

/** Tipos que não carregam pergunta (reação, figurinha, localização…). */
const SEM_CONTEUDO = new Set(['reaction', 'sticker', 'location', 'contacts', 'unsupported']);

export function ehPergunta(m: MensagemAluno): boolean {
  if (SEM_CONTEUDO.has(m.tipo)) return false;
  const bruto = (m.texto ?? '').trim();
  // Foto ou documento sem texto: costuma ser comprovante ou print de erro; vale olhar.
  if (!bruto) return m.tipo === 'image' || m.tipo === 'document';
  if (bruto.startsWith('📎')) return false; // aviso nosso de anexo que a API não entrega
  if (!/[\p{L}\p{N}]/u.test(bruto)) return false; // só emoji
  const t = normalizar(bruto);
  if (t.includes('?')) return true;
  if (PEDIDO.test(t)) {
    // "pode deixar, brigado" e "deu certo, obrigado" têm palavra de pedido, mas fecham.
    return !(FECHAMENTO.test(t) && t.length < 80);
  }
  if (FECHAMENTO.test(t)) return false;
  // Texto mais longo sem agradecimento: em geral é relato ("comprei e não...").
  return t.length >= 40;
}

/** "Não", "só isso", "por enquanto não": resposta curta que encerra. */
const NEGATIVA_CURTA = /^(nao|nao obrigad[oa]|nada|so isso|era so isso|por enquanto nao|por enquanto e so)[\s!.,]*$/;

/**
 * `nossaUltima`: a última mensagem nossa antes das do aluno. Se ela perguntou algo
 * ("qual é o seu objetivo?"), a resposta curta do aluno ("Tecnólogo", "Policial de São
 * Paulo") é a continuação da conversa e precisa de retorno. Sem isso, o piloto e o filtro
 * tratavam essas respostas como "ok" e elas ficavam paradas (09/10/2026).
 */
export function temPerguntaEmAberto(mensagens: MensagemAluno[], nossaUltima?: string | null): boolean {
  // Terminou agradecendo e não perguntou nada explícito: o assunto se fechou
  // ("[foto do comprovante] / Obrigada", "queria o vade / obrigado").
  const comConteudo = mensagens.filter((m) => !SEM_CONTEUDO.has(m.tipo));
  const ultima = comConteudo[comConteudo.length - 1];
  const temInterrogacao = mensagens.some((m) => (m.texto ?? '').includes('?'));
  if (ultima?.texto && !temInterrogacao && FECHAMENTO.test(normalizar(ultima.texto)) && !ehPergunta(ultima)) {
    return false;
  }
  if (mensagens.some(ehPergunta)) return true;
  if (!(nossaUltima ?? '').includes('?')) return false;
  return comConteudo.some((m) => {
    const t = normalizar(m.texto ?? '');
    return /[\p{L}\p{N}]/u.test(t) && !t.startsWith('📎') && !FECHAMENTO.test(t) && !NEGATIVA_CURTA.test(t);
  });
}
