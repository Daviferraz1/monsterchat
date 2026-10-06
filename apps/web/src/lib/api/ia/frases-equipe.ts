/**
 * Frases que a equipe já mandou muitas vezes, para o autocompletar da caixa de
 * mensagem (sem IA: o navegador compara o que está sendo digitado com o começo
 * destas frases e sugere o resto; Tab aceita).
 *
 * Em 90 dias foram ~8.300 mensagens digitadas por atendentes e ~500 frases que
 * se repetem 3+ vezes: abertura, apresentação de curso, regras do Sequencial…
 *
 * Ficam de fora:
 *  - frase com R$ ou link: o histórico tem preço velho ("12x de R$55,33"); preço
 *    e link vêm do ⚡, que lê o catálogo atual;
 *  - frase com e-mail ou sequência de 5+ dígitos (telefone, CPF, pedido);
 *  - frase que apareceu menos de 3 vezes (nome de aluno, caso único).
 *
 * Recalculado no máximo uma vez por dia e guardado em ia_settings, para todas
 * as instâncias lerem o mesmo resultado.
 */
import { supabaseAdmin } from '../supabase';
import { lerTudo } from '../paginado';
import { lerRespostasEquipe } from './mensagens-rapidas';
import { semTravessao } from './team-templates';

const CHAVE = 'frases_equipe';
const DIAS = 90;
const MIN_VEZES = 3;
const MAX_FRASES = 2500;
const VALIDADE_MS = 24 * 60 * 60 * 1000;

/** [texto, vezes]. Mensagem inteira (com quebra de linha) e frase solta entram juntas. */
export type Frase = [string, number];

function aproveitavel(t: string): boolean {
  if (t.length < 12 || t.length > 400) return false;
  if (/R\$|https?:\/\/|www\.|@\S+\.\S+|\d{5,}|\d{3}\.\d{3}/i.test(t)) return false;
  return true;
}

/** Quebra em frases: fim de linha ou ponto/!/? seguido de espaço. */
function frasesDe(corpo: string): string[] {
  return corpo
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function calcular(): Promise<Frase[]> {
  const desde = new Date(Date.now() - DIAS * 86400 * 1000).toISOString();
  const linhas = await lerTudo<{ body: string | null }>((de, ate) =>
    supabaseAdmin
      .from('messages')
      .select('body')
      .eq('direction', 'outbound')
      .eq('content_type', 'text')
      .not('agent_user_id', 'is', null) // digitada por gente, não template nem robô
      .gte('created_at', desde)
      .order('id')
      .range(de, ate)
  );

  const vezes = new Map<string, number>();
  const somar = (t: string) => vezes.set(t, (vezes.get(t) ?? 0) + 1);
  for (const { body } of linhas) {
    const corpo = semTravessao((body ?? '').trim());
    if (!corpo) continue;
    if (corpo.includes('\n') && aproveitavel(corpo)) somar(corpo);
    for (const f of frasesDe(corpo)) if (aproveitavel(f)) somar(f);
  }

  const frases: Frase[] = [...vezes.entries()].filter(([, n]) => n >= MIN_VEZES);
  // As respostas da equipe valem como frase muito usada: são o texto oficial.
  for (const r of await lerRespostasEquipe().catch(() => [])) {
    for (const f of [r.texto, ...frasesDe(r.texto)]) {
      if (f.length < 12) continue;
      frases.push([f, 1000]);
      // "{nome}, para solicitar…" também precisa achar quem digita "Para solicitar…".
      const semNome = f.replace(/^\{nome\},\s*(\p{L})/u, (_, l: string) => l.toUpperCase());
      if (semNome !== f) frases.push([semNome, 1000]);
    }
  }
  return frases.sort((a, b) => b[1] - a[1]).slice(0, MAX_FRASES);
}

export async function frasesEquipe(forcar = false): Promise<Frase[]> {
  const { data } = await supabaseAdmin.from('ia_settings').select('value').eq('key', CHAVE).maybeSingle();
  const salvo = data?.value as { gerado_em?: string; frases?: Frase[] } | null;
  if (!forcar && salvo?.frases && salvo.gerado_em && Date.now() - new Date(salvo.gerado_em).getTime() < VALIDADE_MS) {
    return salvo.frases;
  }
  const frases = await calcular();
  await supabaseAdmin
    .from('ia_settings')
    .upsert({ key: CHAVE, value: { gerado_em: new Date().toISOString(), frases } }, { onConflict: 'key' });
  return frases;
}
