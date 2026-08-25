import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { supabaseAdmin } from '@/lib/api/supabase';
import { sanitizeTokenForHeader } from '@/lib/api/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const IG_GRAPH = 'https://graph.instagram.com';

/** Renova com folga: o token vale 60 dias e é renovável a partir de 24h de vida. */
const RENOVAR_SE_FALTAR_MENOS_DE_DIAS = 20;

interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * GET /api/instagram/cron/refresh-token — mantém vivo o token do Instagram Login.
 *
 * Token de Instagram Login (`IGA...`) **expira**: 60 dias no formato longo, 1 hora no curto.
 * Sem renovar, o canal para de enviar e de buscar perfil de uma hora para outra, sem aviso —
 * e o sintoma é idêntico ao de token errado, o que torna o diagnóstico caro.
 *
 * A Meta renova pelo endpoint `ig_refresh_token`, que devolve um token novo com mais 60 dias.
 * Requisitos dela: o token precisa ter no mínimo 24h de vida, estar válido, e a conta precisa
 * ter tido atividade. Por isso este cron roda semanalmente e só age quando falta pouco —
 * renovar todo dia não adianta nada e ainda gasta chamada.
 *
 * Canais com token do Facebook (`EAA...`) são ignorados: Page token de usuário do sistema não
 * expira e não tem o que renovar.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: channels, error } = await supabaseAdmin
    .from('channels')
    .select('id, name, access_token, token_expires_at, is_active')
    .eq('type', 'instagram')
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const resultados: Array<Record<string, unknown>> = [];

  for (const ch of channels ?? []) {
    const token = sanitizeTokenForHeader(ch.access_token ?? '');

    if (!token) {
      resultados.push({ canal: ch.name, acao: 'ignorado', motivo: 'sem token' });
      continue;
    }
    if (!/^IGA/i.test(token)) {
      resultados.push({ canal: ch.name, acao: 'ignorado', motivo: 'token do Facebook, não expira' });
      continue;
    }

    // Já sabemos a validade e ainda falta muito: não gasta chamada.
    const expiraEm = ch.token_expires_at ? new Date(ch.token_expires_at as string) : null;
    if (expiraEm) {
      const diasRestantes = (expiraEm.getTime() - Date.now()) / 86400000;
      if (diasRestantes > RENOVAR_SE_FALTAR_MENOS_DE_DIAS) {
        resultados.push({ canal: ch.name, acao: 'ainda válido', diasRestantes: Math.round(diasRestantes) });
        continue;
      }
    }

    try {
      const { data } = await axios.get<RefreshResponse>(`${IG_GRAPH}/refresh_access_token`, {
        params: { grant_type: 'ig_refresh_token', access_token: token },
        timeout: 15000,
      });

      if (!data?.access_token) {
        resultados.push({ canal: ch.name, acao: 'falhou', motivo: 'resposta sem access_token' });
        continue;
      }

      const novaValidade = new Date(Date.now() + (data.expires_in ?? 0) * 1000).toISOString();
      const { error: upErr } = await supabaseAdmin
        .from('channels')
        .update({ access_token: data.access_token, token_expires_at: novaValidade, updated_at: new Date().toISOString() })
        .eq('id', ch.id);

      if (upErr) {
        // O token novo existe mas não foi salvo: o antigo continua valendo até vencer,
        // então dá tempo de rodar de novo. Barulho no log é proposital.
        console.error('[Instagram token] Renovado na Meta mas NÃO salvo no banco:', upErr.message, { canal: ch.name });
        resultados.push({ canal: ch.name, acao: 'falhou', motivo: `renovado mas não salvo: ${upErr.message}` });
        continue;
      }

      console.log('[Instagram token] Renovado.', { canal: ch.name, validoAte: novaValidade });
      resultados.push({ canal: ch.name, acao: 'renovado', validoAte: novaValidade, dias: Math.round((data.expires_in ?? 0) / 86400) });
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error?.message ?? err.message : String(err);
      // Erro mais provável: token com menos de 24h de vida, ou já expirado (aí só colando um novo).
      console.error('[Instagram token] Falha ao renovar:', msg, { canal: ch.name });
      resultados.push({ canal: ch.name, acao: 'falhou', motivo: msg });
    }
  }

  const renovados = resultados.filter((r) => r.acao === 'renovado').length;
  const falhas = resultados.filter((r) => r.acao === 'falhou').length;
  return NextResponse.json({ ok: falhas === 0, renovados, falhas, resultados });
}
