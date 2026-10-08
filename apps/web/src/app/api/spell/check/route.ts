import { NextRequest, NextResponse } from 'next/server';

const LT_API = 'https://api.languagetool.org/v2/check';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LTMatch {
  offset: number;
  length: number;
  rule?: { issueType?: string; category?: { id?: string } };
}

/**
 * POST { text } → { erros: [{ offset, length }] } — só erro de ortografia.
 *
 * Alimenta o sublinhado vermelho da caixa de mensagem. O sublinhado do próprio
 * navegador depende de cada atendente ter o dicionário de português ligado, e quase
 * ninguém tinha. Gramática e estilo ficam de fora: sublinhar tudo vira ruído.
 *
 * O LanguageTool público aceita ~20 consultas por minuto por IP; o cache por texto
 * e a pausa de 1 s na digitação (no navegador) seguram o volume da equipe.
 */
const cache = new Map<string, Array<{ offset: number; length: number }>>();

/** Nossos termos que o dicionário não conhece. */
const NOSSO_VOCABULARIO = new Set(
  'monster fagenius guru whatsapp instagram pix videoaula videoaulas tecnologo sequencial edital editais cronograma simulado simulados vade mecum monstro study questoes'.split(' ')
);

/** Sigla (GCM, PMMG), palavra com número, termo nosso ou nome próprio no meio da frase. */
function ignorar(texto: string, offset: number, length: number): boolean {
  const palavra = texto.slice(offset, offset + length);
  if (/^[A-ZÀ-Ý0-9]{2,}$/.test(palavra) || /\d/.test(palavra)) return true;
  const base = palavra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (NOSSO_VOCABULARIO.has(base)) return true;
  // Inicial maiúscula fora do começo de frase: nome de aluno, cidade, marca.
  const antes = texto.slice(0, offset).trimEnd();
  const comecoDeFrase = !antes || /[.!?\n]$/.test(antes);
  return /^[A-ZÀ-Ý]/.test(palavra) && !comecoDeFrase;
}

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json().catch(() => ({}))) as { text?: string };
    if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ erros: [] });
    const alvo = text.slice(0, 5000);
    const salvo = cache.get(alvo);
    if (salvo) return NextResponse.json({ erros: salvo });

    const form = new URLSearchParams({ text: alvo, language: 'pt-BR' });
    const res = await fetch(LT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) return NextResponse.json({ erros: [], indisponivel: true });

    const data = (await res.json()) as { matches?: LTMatch[] };
    const erros = (data.matches ?? [])
      .filter((m) => m.rule?.issueType === 'misspelling' || m.rule?.category?.id === 'TYPOS')
      .filter((m) => !ignorar(alvo, m.offset, m.length))
      .map((m) => ({ offset: m.offset, length: m.length }));
    cache.set(alvo, erros);
    if (cache.size > 1000) cache.delete(cache.keys().next().value!);
    return NextResponse.json({ erros });
  } catch {
    return NextResponse.json({ erros: [] });
  }
}
