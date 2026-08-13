/**
 * Padrão do operador — a IA aprende COMO a equipe responde.
 *
 * Quando o atendente ignora (ou reescreve) a sugestão e manda outra coisa, a diferença
 * entre "o que a IA sugeriu" e "o que o atendente enviou" é comparada por um modelo
 * barato (Haiku), que destila uma LIÇÃO curta e reutilizável — o jeito da casa, não o
 * conteúdo daquele aluno (conteúdo continua indo para a knowledge_base).
 *
 * As lições ativas viram um bloco no system prompt do agente (`buildStyleBlock`), então
 * a próxima sugestão já sai no padrão. Comportamento repetido REFORÇA a lição existente
 * (hits++) em vez de criar uma nova — a tabela não cresce sem controle.
 */
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../supabase';
import { apiEnv } from '../env';
import { isLearnOperatorStyleEnabled } from './autopilot';

const MODEL = 'claude-haiku-4-5-20251001';
/** Abaixo disso a resposta do atendente é curta demais para ensinar algo ("ok", "já vejo"). */
const MIN_RESPONSE_LENGTH = 15;
/** Acima disso a mensagem enviada é praticamente a sugestão (só corrigiu digitação/pontuação). */
const NEAR_IDENTICAL = 0.9;
/** Teto de lições ativas: passando disso só reforçamos as que já existem. */
const MAX_ACTIVE_LESSONS = 50;
/** Quantas lições entram no prompt do agente. */
const LESSONS_IN_PROMPT = 12;
/** Exemplos guardados por lição (para o admin auditar o que a IA aprendeu). */
const MAX_EVIDENCE = 3;

const CACHE_TTL_MS = 60_000;

export interface StyleLesson {
  id: string;
  brand: string;
  trigger_context: string;
  lesson: string;
  hits: number;
  is_active: boolean;
  evidence: Array<{ sugerido?: string; enviado?: string; at?: string }>;
  created_at: string;
  updated_at: string;
}

let blockCache: { at: number; block: string } | null = null;

/** Força a releitura das lições no próximo pedido de sugestão (após aprender/editar/excluir). */
export function invalidateStyleCache(): void {
  blockCache = null;
}

/** Similaridade grosseira por palavras (Jaccard) — só para descartar edições triviais. */
function wordSimilarity(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Lições ativas, das mais reforçadas para as menos. */
async function listActiveLessons(limit: number): Promise<StyleLesson[]> {
  const { data, error } = await supabaseAdmin
    .from('ia_style_lessons')
    .select('id, brand, trigger_context, lesson, hits, is_active, evidence, created_at, updated_at')
    .eq('is_active', true)
    .order('hits', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[IA operator-style] listActiveLessons', error.message);
    return [];
  }
  return (data ?? []) as StyleLesson[];
}

/** Bloco "PADRÃO DO ATENDENTE" para o system prompt do agente (vazio se não houver lições). */
export async function getOperatorStyleBlock(): Promise<string> {
  if (blockCache && Date.now() - blockCache.at < CACHE_TTL_MS) return blockCache.block;
  const lessons = await listActiveLessons(LESSONS_IN_PROMPT);
  const block = lessons
    .map((l) => {
      const quando = l.trigger_context?.trim();
      const prefix = !quando || /^sempre$/i.test(quando) ? '' : `Quando ${quando}: `;
      return `- ${prefix}${l.lesson.trim()}`;
    })
    .join('\n');
  blockCache = { at: Date.now(), block };
  return block;
}

interface StyleDecision {
  action: 'nova' | 'reforcar' | 'ignorar';
  id?: string;
  quando?: string;
  licao?: string;
}

function buildSystemPrompt(lessons: StyleLesson[]): string {
  const existing = lessons.length
    ? lessons.map((l) => `${l.id} | quando: ${l.trigger_context} | lição: ${l.lesson}`).join('\n')
    : '(nenhuma lição registrada ainda)';

  return `Você analisa o atendimento de uma escola de cursos para concursos (Monster Concursos / FAGENIUS) para ensinar a IA a responder no padrão da equipe.

Você recebe: a dúvida do aluno, a mensagem que a IA SUGERIU e a mensagem que o ATENDENTE realmente enviou. Sua tarefa é descobrir se a diferença revela um PADRÃO da equipe — um jeito de responder que deve valer para as próximas conversas parecidas.

REGISTRE (action "nova" ou "reforcar") quando a diferença for de FORMA ou PROCEDIMENTO e for reaproveitável:
- tamanho e estrutura (bem mais curto, uma pergunta por vez, sem introdução, quebra em duas mensagens);
- tom e vocabulário (sem emoji, sem "espero que esteja bem", trata por "você", usa gíria da casa);
- o que sempre acompanha a resposta (mandar o link junto, pedir o e-mail da compra antes de tudo);
- o que a equipe NÃO faz (não promete prazo, não pede desculpas em excesso, não oferece desconto).

IGNORE (action "ignorar") quando:
- a diferença é só o CONTEÚDO/dado daquele aluno (valor, nome do curso, status do pagamento, link específico) — isso já é guardado em outro lugar;
- o atendente mandou algo administrativo ou fora do assunto ("só um momento", "vou verificar", transferência, mensagem para outra pessoa);
- é só correção de digitação ou reordenação sem intenção clara;
- você não consegue enunciar uma regra que faça sentido em OUTRA conversa.

LIÇÕES JÁ REGISTRADAS (id | quando | lição):
${existing}

Se o padrão observado já estiver coberto por uma lição da lista, use action "reforcar" com o "id" dela (pode reescrever a lição em "licao" para ficar mais precisa ou mais abrangente). Prefira reforçar a criar quase-duplicatas.

Responda APENAS com um JSON válido, sem markdown:
{"action":"nova","quando":"preço do curso","licao":"Mande o valor e o link na mesma mensagem, sem perguntar antes se ele quer saber o preço."}
{"action":"reforcar","id":"<id da lista>","licao":"<lição revisada>"}
{"action":"ignorar"}

Regras do texto: "quando" em até 60 caracteres (use "sempre" se valer para toda conversa); "licao" em uma frase no imperativo, até 200 caracteres, em português brasileiro, descrevendo o comportamento desejado da IA.`;
}

export interface LearnOperatorStyleParams {
  /** Mensagem que a IA sugeriu. */
  suggestedResponse: string;
  /** Mensagem que o atendente realmente enviou. */
  actualResponse: string;
  /** Dúvida/contexto do aluno. */
  questionContext: string;
  brand?: string;
}

/**
 * Compara a sugestão com o que o atendente enviou e registra/reforça a lição de estilo.
 * Best-effort: qualquer falha é logada e engolida (não pode atrapalhar o envio da mensagem).
 */
export async function learnOperatorStyle(
  params: LearnOperatorStyleParams
): Promise<{ id?: string; action?: StyleDecision['action']; skipped?: string }> {
  const suggested = params.suggestedResponse?.trim() ?? '';
  const actual = params.actualResponse?.trim() ?? '';
  const question = params.questionContext?.trim() ?? '';

  if (!suggested || !actual) return { skipped: 'sem sugestão ou sem resposta' };
  if (actual.length < MIN_RESPONSE_LENGTH) return { skipped: 'resposta muito curta' };
  if (wordSimilarity(suggested, actual) >= NEAR_IDENTICAL) return { skipped: 'praticamente a mesma resposta' };
  if (!(await isLearnOperatorStyleEnabled())) return { skipped: 'aprendizado de estilo desligado' };
  if (!apiEnv.ANTHROPIC_API_KEY) return { skipped: 'sem API key' };

  try {
    const lessons = await listActiveLessons(40);
    const anthropic = new Anthropic({ apiKey: apiEnv.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: buildSystemPrompt(lessons),
      messages: [
        {
          role: 'user',
          content: `Dúvida/contexto do aluno:\n${question.slice(0, 1500) || '(não informado)'}\n\nMensagem SUGERIDA pela IA:\n${suggested.slice(0, 2000)}\n\nMensagem que o ATENDENTE enviou:\n${actual.slice(0, 2000)}`,
        },
      ],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { skipped: 'IA não retornou JSON' };

    let decision: StyleDecision;
    try {
      decision = JSON.parse(jsonMatch[0]) as StyleDecision;
    } catch {
      return { skipped: 'JSON inválido' };
    }

    if (decision.action === 'ignorar') return { action: 'ignorar', skipped: 'sem padrão reaproveitável' };
    console.log('[IA operator-style]', decision.action, '|', decision.quando ?? '', '|', decision.licao ?? '');

    const sample = {
      sugerido: suggested.slice(0, 600),
      enviado: actual.slice(0, 600),
      at: new Date().toISOString(),
    };
    const now = new Date().toISOString();

    if (decision.action === 'reforcar' && decision.id) {
      const current = lessons.find((l) => l.id === decision.id);
      if (!current) return { skipped: 'lição informada não existe' };
      const evidence = [...(Array.isArray(current.evidence) ? current.evidence : []), sample].slice(-MAX_EVIDENCE);
      const lesson = decision.licao?.trim() ? decision.licao.trim().slice(0, 200) : current.lesson;
      const { error } = await supabaseAdmin
        .from('ia_style_lessons')
        .update({ lesson, hits: current.hits + 1, evidence, updated_at: now })
        .eq('id', current.id);
      if (error) {
        console.warn('[IA operator-style] reforçar', error.message);
        return { skipped: error.message };
      }
      invalidateStyleCache();
      return { id: current.id, action: 'reforcar' };
    }

    if (!decision.licao?.trim()) return { skipped: 'lição vazia' };

    const { count } = await supabaseAdmin
      .from('ia_style_lessons')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    if ((count ?? 0) >= MAX_ACTIVE_LESSONS) {
      console.warn('[IA operator-style] limite de lições ativas atingido; nova lição descartada');
      return { skipped: 'limite de lições ativas atingido' };
    }

    const { data, error } = await supabaseAdmin
      .from('ia_style_lessons')
      .insert({
        brand: params.brand?.trim() || 'both',
        trigger_context: decision.quando?.trim().slice(0, 60) || 'sempre',
        lesson: decision.licao.trim().slice(0, 200),
        hits: 1,
        is_active: true,
        evidence: [sample],
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();
    if (error) {
      console.warn('[IA operator-style] inserir', error.message);
      return { skipped: error.message };
    }
    invalidateStyleCache();
    return { id: data?.id, action: 'nova' };
  } catch (err) {
    console.error('[IA operator-style]', err);
    return { skipped: err instanceof Error ? err.message : 'erro' };
  }
}
