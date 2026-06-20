import { NextRequest, NextResponse } from 'next/server';
import { importCatalog } from '@/lib/api/ia/catalog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Importa cursos/produtos em massa com upsert (atualiza existentes, cria novos).
 * Aceita: um array, um objeto único, { "cursos": [...] } (formato cursos.json)
 * ou { "items": [...] }.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const items = Array.isArray(body)
      ? body
      : Array.isArray(body?.cursos)
        ? body.cursos
        : Array.isArray(body?.items)
          ? body.items
          : body && typeof body === 'object'
            ? [body]
            : null;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'JSON vazio ou inválido. Envie um array, um objeto, ou { "cursos": [...] }.' },
        { status: 400 }
      );
    }
    if (items.length > 500) {
      return NextResponse.json({ error: 'Máximo de 500 itens por importação.' }, { status: 400 });
    }

    const result = await importCatalog(items);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[API ia/catalog/import]', err);
    return NextResponse.json({ error: 'Falha ao importar.' }, { status: 500 });
  }
}
