import { NextResponse } from 'next/server';
import { getTeamContext } from '@/lib/api/team';

export async function requireManager() {
  const ctx = await getTeamContext();
  if (!ctx) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) };
  if (!ctx.isManager) {
    return { error: NextResponse.json({ error: 'Só gestor ou admin pode configurar a automação' }, { status: 403 }) };
  }
  return { ctx };
}

/** Valida e normaliza o corpo de criação/edição. Devolve mensagem de erro ou os campos. */
export function lerRegra(body: Record<string, unknown>, parcial = false) {
  const out: Record<string, unknown> = {};
  if (!parcial || 'nome' in body) {
    const nome = String(body.nome ?? '').trim();
    if (!nome) return { erro: 'Dê um nome para a regra.' };
    out.nome = nome.slice(0, 80);
  }
  if (!parcial || 'palavras' in body) {
    const lista = (Array.isArray(body.palavras) ? body.palavras : String(body.palavras ?? '').split(','))
      .map((p) => String(p).trim())
      .filter(Boolean)
      .slice(0, 20);
    if (lista.length === 0) return { erro: 'Informe ao menos uma palavra-chave.' };
    out.palavras = lista;
  }
  if (!parcial || 'mensagem_direct' in body) {
    const msg = String(body.mensagem_direct ?? '').trim();
    if (!msg) return { erro: 'Escreva a mensagem que vai no direct.' };
    if (msg.length > 1000) return { erro: 'A mensagem do direct passa de 1.000 caracteres.' };
    out.mensagem_direct = msg;
  }
  if ('resposta_publica' in body) {
    const pub = String(body.resposta_publica ?? '').trim();
    if (pub.length > 300) return { erro: 'A resposta pública passa de 300 caracteres.' };
    out.resposta_publica = pub || null;
  }
  if ('media_id' in body) out.media_id = body.media_id ? String(body.media_id) : null;
  if ('ativo' in body) out.ativo = Boolean(body.ativo);
  if ('channel_id' in body && body.channel_id) out.channel_id = String(body.channel_id);
  return { campos: out };
}
