/**
 * Piloto automático: a IA responde sozinha ao aluno no WhatsApp e no direct do Instagram, com o MESMO agente
 * das sugestões (ferramentas, regras, lições, transcrição de áudio, saudação) e só
 * nos assuntos seguros. Roda a cada minuto (cron /api/ia/cron/piloto).
 *
 * Substitui o piloto antigo (reply.ts), que usava o Haiku com o catálogo colado,
 * sem ferramentas, achava compra pelos 8 últimos dígitos do telefone, respondia
 * cada mensagem na hora e não lia áudio.
 *
 * Como decide (por conversa):
 *  1. Última mensagem é do aluno, ele está em silêncio há `espera_seg` (junta as
 *     mensagens em sequência numa resposta só) e há menos de `janela_min`.
 *  2. Nenhum atendente escreveu nas últimas 2h (conversa com gente não é do piloto)
 *     e o piloto ainda não respondeu `max_seguidas` vezes seguidas.
 *  3. Filtro na mensagem do aluno: pagamento/liberação, reembolso/cancelamento,
 *     desconto, escolaridade x cargo, reclamação, foto/áudio sem transcrição → equipe.
 *  4. Gera a resposta pelo caminho da sugestão e passa por um segundo filtro
 *     (regras fixas + classificador) antes de enviar.
 *  Modo ENSAIO: não envia nada, só registra em ia_piloto_log o que faria.
 */
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../supabase';
import { apiEnv } from '../env';
import { sendWhatsAppText } from '../services/whatsapp';
import { sendInstagramText } from '../services/instagram';
import { createMessage } from '../services/message';
import { updateConversation } from '../services/conversation';
import { isAutopilotEnabled } from './autopilot';
import { temAssuntoEmAberto } from '@/lib/pergunta-em-aberto';
import { ehAusenciaInstagram, VIA_AUSENCIA } from '@/lib/ausencia-instagram';

export interface PilotoConfig {
  modo: 'ensaio' | 'ativo';
  /** sempre | madrugada (23h–8h) | fora_comercial (18h–8h e fim de semana) */
  horario: 'sempre' | 'madrugada' | 'fora_comercial';
  espera_seg: number;
  max_seguidas: number;
  janela_min: number;
  /** Conversa com atendente ativo (últimas 2h): o piloto só entra depois deste tempo sem resposta. */
  espera_com_atendente_min: number;
}

const CHAVE = 'piloto_config';
export const PILOTO_PADRAO: PilotoConfig = {
  modo: 'ensaio',
  horario: 'madrugada',
  espera_seg: 120,
  max_seguidas: 3,
  janela_min: 60,
  espera_com_atendente_min: 10,
};

export async function lerConfigPiloto(): Promise<PilotoConfig> {
  const { data } = await supabaseAdmin.from('ia_settings').select('value').eq('key', CHAVE).maybeSingle();
  return { ...PILOTO_PADRAO, ...((data?.value as Partial<PilotoConfig>) ?? {}) };
}

export async function gravarConfigPiloto(cfg: Partial<PilotoConfig>): Promise<PilotoConfig> {
  const atual = await lerConfigPiloto();
  const novo: PilotoConfig = {
    modo: cfg.modo === 'ativo' ? 'ativo' : cfg.modo === 'ensaio' ? 'ensaio' : atual.modo,
    horario: ['sempre', 'madrugada', 'fora_comercial'].includes(cfg.horario as string) ? (cfg.horario as PilotoConfig['horario']) : atual.horario,
    espera_seg: Math.min(900, Math.max(30, Number(cfg.espera_seg ?? atual.espera_seg))),
    max_seguidas: Math.min(10, Math.max(1, Number(cfg.max_seguidas ?? atual.max_seguidas))),
    janela_min: Math.min(720, Math.max(10, Number(cfg.janela_min ?? atual.janela_min))),
    espera_com_atendente_min: Math.min(120, Math.max(3, Number(cfg.espera_com_atendente_min ?? atual.espera_com_atendente_min))),
  };
  await supabaseAdmin.from('ia_settings').upsert({ key: CHAVE, value: novo }, { onConflict: 'key' });
  return novo;
}

function horaSP(d = new Date()): { h: number; diaSemana: number } {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d);
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0) % 24;
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.find((x) => x.type === 'weekday')?.value ?? 'Mon');
  return { h, diaSemana: dia };
}

export function dentroDoHorario(cfg: PilotoConfig, d = new Date()): boolean {
  if (cfg.horario === 'sempre') return true;
  const { h, diaSemana } = horaSP(d);
  if (cfg.horario === 'madrugada') return h >= 23 || h < 8;
  return diaSemana === 0 || diaSemana === 6 || h >= 18 || h < 8;
}

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
}

/** Assuntos que sempre vão para a equipe, pela mensagem do aluno. */
const BLOQUEIOS_ALUNO: Array<[RegExp, string]> = [
  [/\b(paguei|comprei|ja paguei|efetuei o pagamento|fiz o pagamento|comprovante|nao (recebi|chegou|liberou)|libera(r)? (o )?(meu )?acesso|liberacao)\b/, 'pagamento ou liberação de acesso'],
  [/\b(reembolso|estorno|devolu|cancel|tranc|desist|quero (meu )?dinheiro)/, 'reembolso, cancelamento ou trancamento'],
  [/\b(desconto|cupom|mais barato|abaixa|promocao)\b/, 'desconto'],
  [/\b(so tenho (o )?ensino medio|nao tenho (curso |nivel )?superior|escolaridade|nao terminei|terminando o ensino medio|requisito)/, 'escolaridade x requisito do cargo'],
  [/\b(procon|advogad|processar|justica|reclame aqui|golpe|enganad|absurdo|palhacada|vergonha|pessimo|horrivel|descaso)/, 'reclamação'],
];

/** O que a resposta não pode afirmar sozinha. */
const BLOQUEIOS_RESPOSTA: Array<[RegExp, string]> = [
  [/pagamento (foi )?(confirmado|aprovado)|acesso (ja )?(foi )?liberado|liberei/, 'confirma pagamento ou acesso'],
  [/reembolso|estorno|cancelamento|trancamento/, 'fala de reembolso/cancelamento'],
  [/desconto|cupom/, 'fala de desconto'],
  [/vou (verificar|confirmar|checar|consultar)|vamos verificar|confirmar com a equipe|encaminh|retorno em breve/, 'promete retorno da equipe'],
];

/** "Registrei seu interesse… te aviso quando lançar": promessa permitida se o lead foi registrado. */
export const PROMETE_AVISO = /(registr\w* (o )?(seu )?(interesse|contato)|(avis|aviso)\w*.{0,80}(lanc|abrir|abrirmos|sair|novidade|disponivel)|(lanc|novidade).{0,80}avis)/;

function bloqueioNaMensagem(textos: string[]): string | null {
  const t = normalizar(textos.join(' \n '));
  for (const [re, motivo] of BLOQUEIOS_ALUNO) if (re.test(t)) return motivo;
  return null;
}

function bloqueioNaResposta(resposta: string): string | null {
  const t = normalizar(resposta);
  for (const [re, motivo] of BLOQUEIOS_RESPOSTA) if (re.test(t)) return motivo;
  return null;
}

/**
 * Segunda opinião antes de enviar: um modelo barato lê a conversa e a resposta e
 * diz se dá para mandar sem revisão humana. Na dúvida, não manda.
 */
export async function classificar(
  conversa: string,
  resposta: string,
  leadRegistrado = false
): Promise<{ seguro: boolean; assunto: string; motivo: string }> {
  if (!apiEnv.ANTHROPIC_API_KEY) return { seguro: false, assunto: 'outros', motivo: 'sem chave da Anthropic' };
  const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
  const r = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: `Você revisa respostas que a IA de atendimento da Monster Concursos (cursos preparatórios) e da Fagenius (Tecnólogo, Sequencial) vai enviar SOZINHA ao aluno no WhatsApp ou no direct do Instagram, sem revisão humana.

Só é SEGURO enviar se TODAS forem verdade:
- O assunto é um destes: apresentação de curso, preço e formas de pagamento, o que o curso inclui, como acessar a plataforma ou recuperar a senha, dúvida simples sobre concurso/edital respondida com informação objetiva, cumprimento ou encerramento cordial, ou a REGRA PADRÃO DE DISPENSA DE DISCIPLINA do Tecnólogo/Sequencial (o aluno pede pelo portal depois da matrícula, a coordenação analisa cada pedido, não há garantia e a dispensa não reduz a duração do curso) — dizer isso é a resposta oficial, não promessa de retorno.
- A resposta responde de fato o que o aluno perguntou, sem inventar nada.
- Não confirma pagamento, não libera acesso, não fala de reembolso, cancelamento, trancamento ou desconto.
- Não afirma que um curso habilita para um cargo com requisito de escolaridade (isso vai para a equipe), com UMA exceção abaixo.

FATO OFICIAL, SEGURO DE ENVIAR (não é motivo para barrar): "o Tecnólogo em Gestão Pública é graduação de nível superior reconhecida pelo MEC e é aceito em concursos que exigem nível superior em qualquer área, como Investigador e Escrivão da PCMG". Isso está no catálogo e no site; a equipe diz isso todo dia.
Continua indo para a equipe: Sequencial apresentado como válido para cargo de nível superior ou para a PCMG, curso para cargo que exige formação em área específica (Direito, Enfermagem…), aluno que ainda não concluiu o ensino médio.
- O aluno não está irritado nem reclamando.
- Não promete que a equipe vai verificar ou retornar. EXCEÇÃO: "registrei seu interesse e te aviso quando lançar/abrir o curso" é permitido quando o lead foi registrado (indicado abaixo da resposta).

Responda APENAS com JSON: {"seguro": true|false, "assunto": "apresentacao|preco|acesso|conteudo|concurso|cumprimento|outros", "motivo": "frase curta"}`,
    messages: [
      {
        role: 'user',
        content: `CONVERSA:\n${conversa}\n\nRESPOSTA QUE SERIA ENVIADA:\n${resposta}${
          leadRegistrado ? '\n\n(O lead FOI registrado para aviso de lançamento: a promessa de avisar é real e permitida.)' : ''
        }`,
      },
    ],
  });
  const txt = r.content[0]?.type === 'text' ? r.content[0].text : '';
  try {
    const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    return { seguro: j.seguro === true, assunto: String(j.assunto ?? 'outros'), motivo: String(j.motivo ?? '') };
  } catch {
    return { seguro: false, assunto: 'outros', motivo: 'classificador não respondeu em JSON' };
  }
}

interface Msg {
  id: string;
  conversation_id: string;
  direction: string;
  sender_type: string | null;
  agent_user_id: string | null;
  content_type: string;
  body: string | null;
  transcricao: string | null;
  via: string | null;
  created_at: string;
}

async function registrar(entrada: {
  conversationId: string;
  mensagemId: string;
  modo: PilotoConfig['modo'];
  decisao: 'enviou' | 'enviaria' | 'equipe' | 'nada';
  assunto?: string;
  motivo?: string;
  texto?: string;
}) {
  const { error } = await supabaseAdmin.from('ia_piloto_log').insert({
    conversation_id: entrada.conversationId,
    mensagem_id: entrada.mensagemId,
    modo: entrada.modo,
    decisao: entrada.decisao,
    assunto: entrada.assunto ?? null,
    motivo: entrada.motivo ?? null,
    texto: entrada.texto ?? null,
  });
  if (error) console.error('[Piloto] não gravou o registro (rodou a migração 063?):', error.message);
}

/** Marca na conversa que o piloto já tratou esta mensagem do aluno (não trata de novo). */
async function marcarTratada(conversationId: string, metadata: Record<string, unknown> | null, mensagemId: string) {
  const piloto = { ...((metadata?.piloto as Record<string, unknown>) ?? {}), ultima_msg: mensagemId, em: new Date().toISOString() };
  await supabaseAdmin.from('conversations').update({ metadata: { ...(metadata ?? {}), piloto } }).eq('id', conversationId);
}

export interface ResultadoPiloto {
  ativo: boolean;
  modo?: PilotoConfig['modo'];
  candidatas: number;
  tratadas: number;
  enviadas: number;
  equipe: number;
  motivo?: string;
}

export interface DecisaoPiloto {
  decisao: 'enviou' | 'enviaria' | 'equipe' | 'nada' | 'pular';
  motivo?: string;
  assunto?: string;
  texto?: string;
}

interface Conversa {
  id: string;
  metadata: Record<string, unknown> | null;
  contact: { phone?: string; external_id?: string } | null;
  channel: { id?: string; type?: string; external_id?: string; access_token?: string } | null;
}

const ORCAMENTO_MS = 240_000;
const CANAIS = ['whatsapp', 'instagram'];
/** O direct do Instagram recusa texto acima de 1000 caracteres. */
const LIMITE_INSTAGRAM = 1000;

/** Resposta digitada por gente: pelo MonsterChat ou direto no app do Instagram (echo). */
const ehHumano = (m: Msg) => Boolean(m.agent_user_id) || m.via === 'instagram_app';

/** Aviso nosso no lugar de um anexo que o Instagram não entrega (reel, post, foto de visualização única). */
const ehAnexoNaoEntregue = (m: Msg) => /^(📎|📸)/.test(m.body ?? '');

/** Quebra em parágrafos inteiros até o limite; parágrafo maior que o limite é cortado no espaço. */
function emPartes(texto: string, limite: number): string[] {
  const partes: string[] = [];
  let atual = '';
  for (const paragrafo of texto.split(/\n{2,}/)) {
    let p = paragrafo.trim();
    if (!p) continue;
    if (atual && atual.length + 2 + p.length > limite) {
      partes.push(atual);
      atual = '';
    }
    while (p.length > limite) {
      const corte = p.lastIndexOf(' ', limite);
      const fim = corte > limite / 2 ? corte : limite;
      partes.push(p.slice(0, fim).trim());
      p = p.slice(fim).trim();
    }
    atual = atual ? `${atual}\n\n${p}` : p;
  }
  if (atual) partes.push(atual);
  return partes;
}

const MAX_POR_RODADA = 8;

/**
 * Decide (e, fora da simulação, executa) o que o piloto faz numa conversa.
 * `simular`: decide igual, mas não marca, não registra e não envia — para testar
 * com conversas reais sem mexer em nada.
 */
export async function tratarConversa(c: Conversa, cfg: PilotoConfig, simular = false): Promise<DecisaoPiloto> {
  const agora = Date.now();
  const { data } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, direction, sender_type, agent_user_id, content_type, body, transcricao:metadata->>transcricao, via:metadata->>via, created_at')
    .eq('conversation_id', c.id)
    .order('created_at', { ascending: false })
    .limit(30);
  // A mensagem de ausência do Instagram não é resposta: sai da conta, senão a conversa
  // parece respondida e a pergunta do aluno fica parada. O texto também é conferido porque
  // as gravadas antes de 10/10/2026 entraram como resposta de atendente.
  const msgs = ((data ?? []) as Msg[]).filter((m) => m.via !== VIA_AUSENCIA && !(m.direction === 'outbound' && ehAusenciaInstagram(m.body)));
  const ultima = msgs[0];
  if (!ultima || ultima.direction !== 'inbound') return { decisao: 'pular', motivo: 'última mensagem não é do aluno' };
  if (!simular && (c.metadata?.piloto as { ultima_msg?: string } | undefined)?.ultima_msg === ultima.id) {
    return { decisao: 'pular', motivo: 'já tratada' };
  }

  let seguidas = 0;
  for (const m of msgs) {
    if (ehHumano(m)) break;
    if (m.direction === 'outbound' && m.via === 'piloto_ia') seguidas++;
  }
  const pendentes: Msg[] = [];
  for (const m of msgs) {
    if (m.direction !== 'inbound') break;
    pendentes.push(m);
  }
  pendentes.reverse();
  const textos = pendentes.map((m) => (m.content_type === 'audio' ? m.transcricao ?? '' : m.body ?? ''));

  // Atendente ativo (escreveu nas últimas 2h): a conversa é dele, e o piloto só entra
  // como reserva, se o aluno ficar `espera_com_atendente_min` sem resposta. Antes ele
  // nunca entrava, e ficava de fora de metade das conversas do dia (09/10/2026).
  const atendenteAtivo = msgs.some((m) => ehHumano(m) && agora - new Date(m.created_at).getTime() < 2 * 3600_000);
  const esperandoMin = (agora - new Date(pendentes[0].created_at).getTime()) / 60_000;
  if (atendenteAtivo && esperandoMin < cfg.espera_com_atendente_min) {
    return { decisao: 'pular', motivo: `atendente ativo; aguardando ${cfg.espera_com_atendente_min} min sem resposta` };
  }

  if (!simular) await marcarTratada(c.id, c.metadata, ultima.id);
  const base = { conversationId: c.id, mensagemId: ultima.id, modo: cfg.modo } as const;
  const fechar = async (d: DecisaoPiloto): Promise<DecisaoPiloto> => {
    if (!simular && d.decisao !== 'pular') await registrar({ ...base, ...d, decisao: d.decisao as 'enviou' | 'enviaria' | 'equipe' | 'nada' });
    return d;
  };

  if (seguidas >= cfg.max_seguidas) return fechar({ decisao: 'equipe', motivo: `piloto já respondeu ${seguidas} vezes seguidas` });
  const nossaUltima = msgs[pendentes.length]?.direction === 'outbound' ? msgs[pendentes.length].body : null;
  if (!temAssuntoEmAberto(pendentes.map((m, i) => ({ tipo: m.content_type, texto: textos[i] || null })), nossaUltima)) {
    return fechar({ decisao: 'nada', motivo: 'só agradecimento, ok ou reação' });
  }
  const midia = pendentes.find(
    (m) =>
      ['image', 'document', 'video'].includes(m.content_type) ||
      (m.content_type === 'audio' && !m.transcricao?.trim()) ||
      ehAnexoNaoEntregue(m)
  );
  const bloqueio = midia ? 'foto, documento, anexo ou áudio sem transcrição' : bloqueioNaMensagem(textos);
  if (bloqueio) return fechar({ decisao: 'equipe', motivo: bloqueio });

  // Mesmo caminho da sugestão do atendente: agente, regras, saudação, sem travessão.
  const { POST } = await import('@/app/api/ia/suggestion/route');
  const resp = await POST(
    new Request('http://piloto.interno/api/ia/suggestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: c.id, messageBody: textos.join('\n') }),
    }) as never
  );
  const texto = String(((await resp.json()) as { suggestion?: string | null }).suggestion ?? '').trim();
  if (!texto) return fechar({ decisao: 'nada', motivo: 'a IA decidiu que não há o que responder' });

  const conversa = msgs
    .slice(0, 12)
    .reverse()
    .map((m) => `${m.direction === 'inbound' ? 'ALUNO' : 'ATENDENTE'}: ${(m.content_type === 'audio' ? m.transcricao : m.body) ?? `[${m.content_type}]`}`)
    .join('\n');
  // "Te aviso quando lançar" só vale se a IA registrou o lead (classificar_lead) nesta
  // sugestão; sem o registro, a promessa ficaria vazia.
  let leadRegistrado = false;
  if (PROMETE_AVISO.test(normalizar(texto))) {
    const { data: rastro } = await supabaseAdmin
      .from('ia_suggestion_traces')
      .select('tools_used')
      .eq('conversation_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    leadRegistrado = ((rastro?.tools_used as string[] | null) ?? []).includes('classificar_lead');
    if (!leadRegistrado) return fechar({ decisao: 'equipe', motivo: 'promete avisar no lançamento sem ter registrado o lead', texto });
  }
  const regra = bloqueioNaResposta(texto);
  const revisao = regra ? { seguro: false, assunto: 'outros', motivo: regra } : await classificar(conversa, texto, leadRegistrado);
  if (!revisao.seguro) return fechar({ decisao: 'equipe', assunto: revisao.assunto, motivo: revisao.motivo, texto });

  if (cfg.modo === 'ensaio' || simular) return fechar({ decisao: 'enviaria', assunto: revisao.assunto, texto });

  const instagram = c.channel?.type === 'instagram';
  // No Instagram o destinatário é o IGSID (external_id); telefone não serve.
  const para = (instagram ? c.contact?.external_id : c.contact?.phone || c.contact?.external_id) || '';
  if (!c.channel?.external_id || !c.channel.access_token || !para) {
    return fechar({ decisao: 'equipe', motivo: 'canal ou destinatário ausente', texto });
  }
  // O direct não tem negrito: os asteriscos do WhatsApp apareceriam no texto.
  const final = instagram ? texto.replace(/\*([^*\n]+)\*/g, '$1') : texto;
  const partes = instagram ? emPartes(final, LIMITE_INSTAGRAM) : [final];
  let enviadas = 0;
  try {
    for (const parte of partes) {
      const externalId = instagram
        ? (await sendInstagramText({ pageId: c.channel.external_id, accessToken: c.channel.access_token, recipientId: para, text: parte })).message_id
        : (await sendWhatsAppText({ phoneNumberId: c.channel.external_id, accessToken: c.channel.access_token, to: para, text: parte })).messages?.[0]?.id;
      enviadas++;
      await createMessage({
        conversationId: c.id,
        direction: 'outbound',
        senderType: 'bot',
        contentType: 'text',
        body: parte,
        externalId,
        status: 'sent',
        metadata: { via: 'piloto_ia', assunto: revisao.assunto },
      });
    }
    // Sem lastAgentReplyAt: resposta automática não conta como atendimento humano.
    await updateConversation(c.id, { lastMessageAt: new Date().toISOString(), lastMessagePreview: `🤖 ${final.slice(0, 110)}` });
    return fechar({ decisao: 'enviou', assunto: revisao.assunto, texto: final });
  } catch (err) {
    console.error('[Piloto] falha ao enviar:', err);
    const canal = instagram ? 'Instagram' : 'WhatsApp';
    return fechar({ decisao: 'equipe', motivo: enviadas ? `falha no meio do envio pelo ${canal} (${enviadas} de ${partes.length} partes saíram)` : `falha ao enviar pelo ${canal}`, texto: final });
  }
}

export async function rodarPiloto(): Promise<ResultadoPiloto> {
  const inicio = Date.now();
  if (!(await isAutopilotEnabled())) return { ativo: false, candidatas: 0, tratadas: 0, enviadas: 0, equipe: 0, motivo: 'piloto desligado' };
  const cfg = await lerConfigPiloto();
  if (!dentroDoHorario(cfg)) return { ativo: true, modo: cfg.modo, candidatas: 0, tratadas: 0, enviadas: 0, equipe: 0, motivo: 'fora do horário' };

  // Trava simples: o cron é por minuto e uma rodada pode passar disso.
  const { data: trava } = await supabaseAdmin.from('ia_settings').select('value').eq('key', 'piloto_trava').maybeSingle();
  if (trava?.value && Date.now() < Number((trava.value as { ate?: number }).ate ?? 0)) {
    return { ativo: true, modo: cfg.modo, candidatas: 0, tratadas: 0, enviadas: 0, equipe: 0, motivo: 'rodada anterior em andamento' };
  }
  await supabaseAdmin.from('ia_settings').upsert({ key: 'piloto_trava', value: { ate: Date.now() + ORCAMENTO_MS + 30_000 } }, { onConflict: 'key' });

  const res: ResultadoPiloto = { ativo: true, modo: cfg.modo, candidatas: 0, tratadas: 0, enviadas: 0, equipe: 0 };
  try {
    const agora = Date.now();
    const { data: convs } = await supabaseAdmin
      .from('conversations')
      .select('id, metadata, contact:contacts(phone, external_id), channel:channels(id, type, external_id, access_token)')
      .neq('status', 'closed')
      .gte('last_message_at', new Date(agora - cfg.janela_min * 60_000).toISOString())
      .lte('last_message_at', new Date(agora - cfg.espera_seg * 1000).toISOString())
      .limit(200);
    const doPiloto = ((convs ?? []) as unknown as Conversa[]).filter((c) => CANAIS.includes(c.channel?.type ?? ''));
    res.candidatas = doPiloto.length;
    for (const c of doPiloto) {
      if (res.tratadas >= MAX_POR_RODADA || Date.now() - inicio > ORCAMENTO_MS) break;
      const d = await tratarConversa(c, cfg);
      if (d.decisao === 'pular') continue;
      res.tratadas++;
      if (d.decisao === 'enviou') res.enviadas++;
      if (d.decisao === 'equipe') res.equipe++;
    }
  } finally {
    await supabaseAdmin.from('ia_settings').upsert({ key: 'piloto_trava', value: { ate: 0 } }, { onConflict: 'key' });
  }
  return res;
}
