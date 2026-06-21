/**
 * Diagnóstico de acesso na plataforma de alunos (2º Supabase: Monster Questões + Study).
 * Read-only: dado um e-mail (e/ou CPF), verifica cadastro, liberação de Questões (User.is_premium
 * + plan_expires_at) e de cursos (student_course_enrollments.access_end_date), além do último
 * webhook do Guru (GuruWebhookLog) — para diagnosticar "comprou e não recebeu acesso".
 */
import { apiEnv } from '../env';
import { fetchGuruTransactionsLive } from './guru-live';

export function isPlatformEnabled(): boolean {
  return !!(apiEnv.PLATFORM_SUPABASE_URL && apiEnv.PLATFORM_SUPABASE_SERVICE_KEY);
}

async function pget<T = Record<string, unknown>>(path: string): Promise<T[]> {
  const base = apiEnv.PLATFORM_SUPABASE_URL?.replace(/\/$/, '');
  const key = apiEnv.PLATFORM_SUPABASE_SERVICE_KEY;
  if (!base || !key) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

async function ppatch(path: string, body: unknown): Promise<boolean> {
  const base = apiEnv.PLATFORM_SUPABASE_URL?.replace(/\/$/, '');
  const key = apiEnv.PLATFORM_SUPABASE_SERVICE_KEY;
  if (!base || !key) return false;
  try {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function isFuture(d: unknown): boolean {
  if (!d) return false;
  const t = new Date(String(d)).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function fmtDate(d: unknown): string {
  if (!d) return '';
  try {
    return new Date(String(d)).toLocaleDateString('pt-BR');
  } catch {
    return String(d);
  }
}

const enc = encodeURIComponent;

export interface DiagnosticoAcesso {
  configured: boolean;
  resumo: string;
  temAcesso?: boolean;
  temCadastro?: boolean;
}

/**
 * Diagnostica o acesso do aluno na plataforma. Retorna um resumo legível para a IA usar.
 */
export async function diagnosticarAcesso(params: { email?: string; cpf?: string }): Promise<DiagnosticoAcesso> {
  if (!isPlatformEnabled()) {
    return { configured: false, resumo: 'Diagnóstico da plataforma não configurado (falta PLATFORM_SUPABASE_*).' };
  }
  const email = (params.email || '').trim().toLowerCase();
  const cpf = (params.cpf || '').replace(/\D/g, '');
  if (!email && !cpf) {
    return { configured: true, resumo: 'Para diagnosticar o acesso, preciso do e-mail (ou CPF) da compra.' };
  }

  // Monster Questões (User)
  const users = email
    ? await pget(`User?email=ilike.${enc(email)}&select=id,email,is_premium,plan_name,plan_expires_at,full_name&limit=1`)
    : [];
  const user = users[0] as
    | { id: string; email: string; is_premium?: boolean; plan_name?: string; plan_expires_at?: string; full_name?: string }
    | undefined;

  // Monster Study (students) — por e-mail ou CPF
  const filtroStudent = [email ? `email.ilike.${email}` : '', cpf ? `cpf.eq.${cpf}` : ''].filter(Boolean).join(',');
  const students = filtroStudent
    ? await pget(`students?or=(${enc(filtroStudent)})&select=id,email,cpf,name,account_status&limit=1`)
    : [];
  const student = students[0] as
    | { id: string; email?: string; cpf?: string; name?: string; account_status?: string }
    | undefined;

  // Matrículas em cursos (acesso)
  let enrollments: Array<{
    is_active?: boolean;
    access_start_date?: string;
    access_end_date?: string;
    course?: { name?: string } | null;
  }> = [];
  if (student?.id) {
    enrollments = (await pget(
      `student_course_enrollments?student_id=eq.${enc(student.id)}&select=is_active,access_start_date,access_end_date,course:courses(name)&order=created_at.desc&limit=10`
    )) as typeof enrollments;
  }

  // Último(s) webhook(s) do Guru para esse e-mail
  const webhooks = email
    ? ((await pget(
        `GuruWebhookLog?user_email=ilike.${enc(email)}&select=type,status,processed,error,created_at&order=created_at.desc&limit=3`
      )) as Array<{ type?: string; status?: string; processed?: boolean; error?: string; created_at?: string }>)
    : [];

  // --- Monta o diagnóstico ---
  const linhas: string[] = [];

  if (!user && !student) {
    linhas.push('❌ SEM cadastro na plataforma (nem em Questões nem em Study) para este e-mail/CPF.');
  } else {
    if (user) {
      const ativo = user.is_premium === true && (user.plan_expires_at == null || isFuture(user.plan_expires_at));
      linhas.push(
        `Monster Questões: ${ativo ? '✅ ativo' : '❌ inativo'} (premium=${user.is_premium ? 'sim' : 'não'}${
          user.plan_expires_at ? `, expira ${fmtDate(user.plan_expires_at)}` : ''
        }${user.plan_name ? `, plano ${user.plan_name}` : ''}).`
      );
    } else {
      linhas.push('Monster Questões: ❌ sem conta (User) para este e-mail.');
    }

    if (student) {
      const cursosAtivos = enrollments.filter((e) => e.is_active && (e.access_end_date == null || isFuture(e.access_end_date)));
      if (cursosAtivos.length) {
        linhas.push(
          'Cursos (Study): ✅ ' +
            cursosAtivos
              .map((e) => `${e.course?.name || 'curso'}${e.access_end_date ? ` até ${fmtDate(e.access_end_date)}` : ' (sem prazo)'}`)
              .join('; ')
        );
      } else if (enrollments.length) {
        linhas.push(
          'Cursos (Study): ❌ matrícula(s) sem acesso válido — ' +
            enrollments
              .map((e) => `${e.course?.name || 'curso'} (${e.is_active ? 'ativa' : 'inativa'}${e.access_end_date ? `, venceu ${fmtDate(e.access_end_date)}` : ''})`)
              .join('; ')
        );
      } else {
        linhas.push(`Cursos (Study): ❌ aluno existe (status ${student.account_status || '?'}) mas sem matrícula em curso.`);
      }
      if (student.account_status && student.account_status !== 'active') {
        linhas.push(`⚠️ Conta do aluno está "${student.account_status}".`);
      }
    } else {
      linhas.push('Cursos (Study): ❌ sem perfil de aluno (students) para este e-mail/CPF.');
    }
  }

  if (webhooks.length) {
    const w = webhooks[0];
    linhas.push(
      `Último webhook Guru: ${w.type || '?'} | status ${w.status || '?'} | processado ${w.processed ? 'sim' : 'não'}${
        w.error ? ` | ERRO: ${w.error}` : ''
      } (${fmtDate(w.created_at)}).`
    );
  } else if (email) {
    linhas.push('Webhook Guru: nenhum registro para este e-mail (a compra pode não ter chegado na plataforma).');
  }

  // Conclusão / recomendação
  const temAcesso =
    (user && user.is_premium === true && (user.plan_expires_at == null || isFuture(user.plan_expires_at))) ||
    enrollments.some((e) => e.is_active && (e.access_end_date == null || isFuture(e.access_end_date)));
  const reativavel =
    (!!user && user.is_premium !== true && (user.plan_expires_at == null || isFuture(user.plan_expires_at))) ||
    enrollments.some((e) => !e.is_active && (e.access_end_date == null || isFuture(e.access_end_date)));
  if (temAcesso) {
    linhas.push('➡️ Diagnóstico: acesso JÁ liberado. Oriente o aluno a entrar e, se não lembra a senha, redefinir a senha.');
  } else if (!user && !student) {
    linhas.push('➡️ Diagnóstico: sem cadastro. Se o pagamento estiver confirmado, é caso de LIBERAR — o atendente clica em "Liberar acesso".');
  } else if (reativavel) {
    linhas.push('➡️ Diagnóstico: cadastrado e DENTRO do prazo, mas com acesso inativo. É caso de LIBERAR — o atendente clica em "Liberar acesso".');
  } else {
    linhas.push('➡️ Diagnóstico: o acesso VENCEU (prazo encerrado). NÃO é caso de liberar — é renovação/nova compra. Confira as datas; se confirmado, oriente o aluno a renovar (não reative acesso expirado).');
  }

  return { configured: true, resumo: linhas.join('\n'), temAcesso: !!temAcesso, temCadastro: !!(user || student) };
}

/** Reativação direta no banco (quando NÃO há webhook do Guru para reprocessar): liga is_premium e reativa matrículas. */
async function reativarDireto(email: string): Promise<{ ok: boolean; message: string }> {
  const lines: string[] = [];
  let changed = false;

  const users = await pget<{ id: string; is_premium?: boolean; plan_expires_at?: string }>(
    `User?email=ilike.${enc(email)}&select=id,is_premium,plan_expires_at&limit=1`
  );
  const user = users[0];
  if (user) {
    const planoValido = user.plan_expires_at == null || isFuture(user.plan_expires_at);
    if (user.is_premium === true) {
      lines.push('Monster Questões já estava ativo.');
    } else if (!planoValido) {
      lines.push(
        `Monster Questões: plano VENCIDO em ${fmtDate(user.plan_expires_at)} — NÃO reativado. É caso de renovação/nova compra, não de liberação.`
      );
    } else if (await ppatch(`User?id=eq.${enc(user.id)}`, { is_premium: true })) {
      changed = true;
      lines.push('Monster Questões reativado (is_premium=true).');
    } else {
      lines.push('Falha ao reativar Monster Questões.');
    }
  }

  const students = await pget<{ id: string }>(`students?email=ilike.${enc(email)}&select=id&limit=1`);
  const student = students[0];
  if (student) {
    const ens = await pget<{ id: string; is_active?: boolean; access_end_date?: string; course?: { name?: string } | null }>(
      `student_course_enrollments?student_id=eq.${enc(student.id)}&select=id,is_active,access_end_date,course:courses(name)`
    );
    const nome = (e: { course?: { name?: string } | null }) => e.course?.name || 'curso';
    const reativaveis = ens.filter((e) => !e.is_active && (e.access_end_date == null || isFuture(e.access_end_date)));
    const vencidas = ens.filter((e) => !e.is_active && e.access_end_date && !isFuture(e.access_end_date));
    let reativadas = 0;
    for (const e of reativaveis) {
      if (await ppatch(`student_course_enrollments?id=eq.${enc(e.id)}`, { is_active: true })) reativadas++;
    }
    if (reativadas > 0) {
      changed = true;
      lines.push(`${reativadas} matrícula(s) reativada(s): ${reativaveis.map(nome).join(', ')}.`);
    }
    if (vencidas.length) {
      lines.push(`${vencidas.length} matrícula(s) VENCIDA(S) — NÃO reativadas (renovação/nova compra): ${vencidas.map(nome).join(', ')}.`);
    }
    if (!reativaveis.length && !vencidas.length) {
      lines.push(ens.length ? 'Matrículas de curso já ativas.' : 'Sem matrícula em curso para reativar (curso novo precisa criar a matrícula).');
    }
  }

  if (!user && !student) {
    return { ok: false, message: 'Conta não encontrada na plataforma para este e-mail (nem Questões nem Study).' };
  }
  return { ok: true, message: (changed ? '✅ Reativação direta concluída. ' : 'Nada a reativar. ') + lines.join(' ') };
}

/**
 * Libera o acesso do aluno (ação do ATENDENTE):
 * - Se há webhook do Guru salvo → reprocessa (replay na edge function, recria/libera com a data da compra).
 * - Se NÃO há (conta antiga/manual/sem Guru) → reativação direta no banco (is_premium + matrículas).
 */
export async function liberarAcesso(params: { email: string }): Promise<{ ok: boolean; message: string }> {
  if (!isPlatformEnabled()) return { ok: false, message: 'Plataforma não configurada (PLATFORM_SUPABASE_*).' };
  const email = (params.email || '').trim().toLowerCase();
  if (!email) return { ok: false, message: 'Informe o e-mail da compra.' };

  const rows = await pget<{ id: string; payload: unknown }>(
    `GuruWebhookLog?user_email=ilike.${enc(email)}&payload=not.is.null&select=id,payload,created_at&order=created_at.desc&limit=1`
  );
  const payload = rows[0]?.payload;
  if (!payload) {
    // Sem webhook salvo → reativação direta SÓ se a compra estiver confirmada (aprovada) no Guru.
    const guru = await fetchGuruTransactionsLive({ email });
    if (!guru.configured) {
      return {
        ok: false,
        message:
          'Não há webhook salvo e a consulta ao Guru não está configurada (DIGITAL_GURU_USER_TOKEN/URL) — sem confirmar a compra, a liberação fica bloqueada.',
      };
    }
    if (!guru.ok) {
      return { ok: false, message: 'Não consegui confirmar a compra no Guru agora (erro/timeout). Tente novamente em instantes.' };
    }
    if (!guru.approved) {
      return {
        ok: false,
        message:
          'Sem compra APROVADA no Guru para este e-mail (e sem webhook salvo). Não é possível liberar — confira o e-mail da compra ou a transação no Guru.',
      };
    }
    // Confirmado no Guru → reativação direta no banco (respeitando o prazo).
    return reativarDireto(email);
  }

  const base = apiEnv.PLATFORM_SUPABASE_URL!.replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(`${base}/functions/v1/guru-webhook-unificado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 300) };
    }
    const ok = res.ok && parsed?.ok !== false;
    return {
      ok,
      message: ok
        ? 'Liberação reprocessada. O acesso deve ser ativado em instantes — confira/atualize em seguida.'
        : `A função respondeu com erro: ${parsed?.erro || parsed?.error || JSON.stringify(parsed).slice(0, 200)}`,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return { ok: false, message: isAbort ? 'Timeout ao chamar a função de liberação.' : 'Erro ao chamar a função de liberação.' };
  }
}
