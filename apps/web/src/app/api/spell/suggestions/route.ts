import { NextRequest, NextResponse } from 'next/server';

const LT_API = 'https://api.languagetool.org/v2/check';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LTMatch {
  offset: number;
  length: number;
  replacements?: Array<{ value: string }>;
}

interface LTResponse {
  matches: LTMatch[];
}

/**
 * POST body: { text: string, offset: number }
 * offset = posição do cursor no texto (selectionStart).
 * Retorna sugestões do LanguageTool para o erro que cobre essa posição.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, offset } = body as { text?: string; offset?: number };

    if (typeof text !== 'string' || text.length === 0) {
      return NextResponse.json(
        { error: 'text é obrigatório' },
        { status: 400 }
      );
    }

    if (typeof offset !== 'number' || offset < 0 || offset > text.length) {
      return NextResponse.json(
        { error: 'offset inválido' },
        { status: 400 }
      );
    }

    const form = new URLSearchParams();
    form.set('text', text.slice(0, 20000));
    form.set('language', 'pt-BR');

    const res = await fetch(LT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Serviço de correção indisponível' },
        { status: 502 }
      );
    }

    const data = (await res.json()) as LTResponse;
    const match = data.matches?.find(
      (m) => offset >= m.offset && offset < m.offset + m.length
    );

    if (!match || !match.replacements?.length) {
      return NextResponse.json({
        suggestions: [],
        offset: undefined,
        length: undefined,
      });
    }

    const suggestions = match.replacements
      .map((r) => r.value?.trim())
      .filter(Boolean) as string[];

    return NextResponse.json({
      suggestions,
      offset: match.offset,
      length: match.length,
    });
  } catch (e) {
    console.error('Spell suggestions error:', e);
    return NextResponse.json(
      { error: 'Erro ao obter sugestões' },
      { status: 500 }
    );
  }
}
