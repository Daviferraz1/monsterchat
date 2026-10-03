/**
 * Tudo sobre o aluno, para a IA de atendimento: quem é, o que comprou, como
 * está estudando (aulas, cronograma, questões, simulados) e o que tem no curso.
 *
 * Lê o Supabase da plataforma (Monster Questões + Study) com a service key.
 * As RPCs "do aluno" do Study (get_course_outline, get_my_enrolled_courses…)
 * dependem de auth.uid() e voltam vazias aqui — por isso a lógica é refeita
 * com consultas diretas. Mesmo id em "User", students e nas tabelas de KPI.
 */
import { apiEnv } from '../env';
import { supabaseAdmin } from '../supabase';
import { matchByName } from '../ia/site-course-match';
import { isPlatformEnabled, pget } from './platform-access';

const enc = encodeURIComponent;

function cfg() {
  return {
    base: apiEnv.PLATFORM_SUPABASE_URL?.replace(/\/$/, '') ?? '',
    key: apiEnv.PLATFORM_SUPABASE_SERVICE_KEY ?? '',
  };
}

/** Quantas linhas a consulta devolveria (sem trazê-las). */
async function pcount(path: string): Promise<number | null> {
  const { base, key } = cfg();
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' },
    });
    const total = res.headers.get('content-range')?.split('/')[1];
    return total && total !== '*' ? Number(total) : null;
  } catch {
    return null;
  }
}

async function prpc<T = unknown>(fn: string, body: Record<string, unknown>): Promise<T | null> {
  const { base, key } = cfg();
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function dataBr(d?: string | null): string {
  if (!d) return '';
  const [a, m, dia] = d.slice(0, 10).split('-');
  return dia && m && a ? `${dia}/${m}/${a}` : d;
}

const ult8 = (s?: string | null) => (s ?? '').replace(/\D/g, '').slice(-8);

function mascararEmail(e?: string | null): string {
  if (!e) return '';
  const [u, d] = e.split('@');
  return d ? `${u.slice(0, 2)}***@${d}` : e;
}

// ── identificação ────────────────────────────────────────────────────────────

export type ComoIdentificado = 'telefone' | 'compra' | 'email do contato' | 'email informado';

export interface AlunoIdentificado {
  id: string;
  nome: string | null;
  email: string | null;
  como: ComoIdentificado;
}

export type ResultadoBusca =
  | { tipo: 'achado'; aluno: AlunoIdentificado }
  | { tipo: 'varios'; candidatos: AlunoIdentificado[] }
  | { tipo: 'nenhum' };

type Pessoa = { id: string; email: string | null; full_name?: string | null; name?: string | null; phone?: string | null };

async function porEmails(emails: string[]): Promise<Pessoa[]> {
  const lista = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')))].slice(0, 10);
  if (!lista.length) return [];
  const filtro = enc(`(${lista.map((e) => `email.ilike.${e}`).join(',')})`);
  const [u, s] = await Promise.all([
    pget<Pessoa>(`User?or=${filtro}&select=id,email,full_name,phone`),
    pget<Pessoa>(`students?or=${filtro}&select=id,email,name,phone`),
  ]);
  return [...u, ...s];
}

async function porTelefone(phone: string): Promise<Pessoa[]> {
  const d8 = ult8(phone);
  if (d8.length < 8) return [];
  const [u, s] = await Promise.all([
    pget<Pessoa>(`User?phone=like.*${d8}*&select=id,email,full_name,phone`),
    pget<Pessoa>(`students?phone=like.*${d8}*&select=id,email,name,phone`),
  ]);
  return [...u, ...s].filter((p) => ult8(p.phone) === d8);
}

/** E-mails das compras no Guru feitas com este telefone (o cadastro da plataforma quase nunca tem telefone). */
async function emailsDasCompras(contactId?: string, phone?: string): Promise<string[]> {
  const emails = new Set<string>();
  if (contactId) {
    const { data } = await supabaseAdmin.from('guru_sales').select('contact_email').eq('contact_id', contactId).limit(20);
    for (const r of data ?? []) if (r.contact_email) emails.add(String(r.contact_email));
  }
  const d8 = ult8(phone);
  if (d8.length === 8) {
    const { data } = await supabaseAdmin.from('guru_sales').select('contact_email').ilike('contact_phone', `%${d8}%`).limit(20);
    for (const r of data ?? []) if (r.contact_email) emails.add(String(r.contact_email));
  }
  return [...emails];
}

async function emailsDoContato(contactId?: string): Promise<string[]> {
  if (!contactId) return [];
  const { data } = await supabaseAdmin.from('contacts').select('email, metadata').eq('id', contactId).maybeSingle();
  const dados = (data?.metadata as { dados?: { email?: string } } | null)?.dados;
  return [data?.email, dados?.email].filter((e): e is string => !!e);
}

/**
 * Acha o aluno do contato. Ordem de confiança: telefone do WhatsApp no
 * cadastro → e-mail das compras feitas com esse telefone → e-mail salvo no
 * contato → e-mail que a pessoa digitou na conversa (o menos confiável: dá
 * para digitar o e-mail de outra pessoa).
 */
export async function identificarAluno(p: {
  contactId?: string;
  phone?: string;
  emailInformado?: string;
}): Promise<ResultadoBusca> {
  if (!isPlatformEnabled()) return { tipo: 'nenhum' };
  const tentativas: Array<[ComoIdentificado, () => Promise<Pessoa[]>]> = [
    ['telefone', () => (p.phone ? porTelefone(p.phone) : Promise.resolve([]))],
    ['compra', async () => porEmails(await emailsDasCompras(p.contactId, p.phone))],
    ['email do contato', async () => porEmails(await emailsDoContato(p.contactId))],
    ['email informado', () => porEmails(p.emailInformado ? [p.emailInformado] : [])],
  ];
  for (const [como, buscar] of tentativas) {
    const pessoas = await buscar();
    const porId = new Map<string, AlunoIdentificado>();
    for (const x of pessoas) {
      const atual = porId.get(x.id);
      porId.set(x.id, {
        id: x.id,
        nome: atual?.nome || x.full_name || x.name || null,
        email: atual?.email || x.email,
        como,
      });
    }
    if (porId.size === 1) return { tipo: 'achado', aluno: [...porId.values()][0] };
    if (porId.size > 1) return { tipo: 'varios', candidatos: [...porId.values()] };
  }
  return { tipo: 'nenhum' };
}

// ── resumo do aluno ──────────────────────────────────────────────────────────

type Matricula = {
  course_id: string;
  is_active: boolean | null;
  progress_percentage: number | null;
  enrolled_at: string | null;
  access_start_date: string | null;
  access_end_date: string | null;
  course: { name: string; platform: string | null } | null;
};
/** Tarefa do cronograma como está no JSON de students.generated_schedule_tasks. */
type Tarefa = {
  date: string;
  status: string | null;
  is_break?: boolean;
  subject_name?: string | null;
  topic_name?: string | null;
  lesson_title?: string | null;
};

function acessoValido(m: Matricula, hoje: string): boolean {
  if (!m.is_active) return false;
  if (m.access_start_date && m.access_start_date.slice(0, 10) > hoje) return false;
  return !m.access_end_date || m.access_end_date.slice(0, 10) >= hoje;
}

function tarefaTxt(t: Tarefa): string {
  return [t.subject_name, t.topic_name, t.lesson_title].filter(Boolean).join(' › ');
}

/**
 * Resumo em texto para o agente: conta, cursos, cronograma, desempenho, simulados.
 *
 * Duas fontes da plataforma estão desatualizadas e NÃO são usadas:
 * `study_tasks` (vazia para alunos com cronograma) e
 * `student_course_enrollments.progress_percentage` (0% para quem já concluiu
 * dezenas de aulas). O cronograma vem do JSON do aluno e o % de aulas é
 * recalculado a partir de lesson_progress.
 */
export async function resumoAluno(aluno: AlunoIdentificado): Promise<string> {
  const id = enc(aluno.id);
  const hoje = hojeSP();

  const [user, student, matriculas, kpi, materias, emRisco, concluidas, ultimaAula, simulados] =
    await Promise.all([
      pget<{ full_name: string | null; is_premium: boolean | null; plan_name: string | null; plan_expires_at: string | null }>(
        `User?id=eq.${id}&select=full_name,is_premium,plan_name,plan_expires_at`
      ),
      pget<{
        name: string | null;
        account_status: string | null;
        last_access_at: string | null;
        schedule_start_date: string | null;
        schedule_end_date: string | null;
        daily_availability: Record<string, number> | null;
        generated_schedule_tasks: Tarefa[] | null;
      }>(
        `students?id=eq.${id}&select=name,account_status,last_access_at,schedule_start_date,schedule_end_date,daily_availability,generated_schedule_tasks`
      ),
      pget<Matricula>(
        `student_course_enrollments?student_id=eq.${id}&select=course_id,is_active,progress_percentage,enrolled_at,access_start_date,access_end_date,course:courses(name,platform)&order=enrolled_at.desc&limit=15`
      ),
      pget<Record<string, number | string | null>>(`student_kpi?user_id=eq.${id}`),
      pget<{ materia: string; questoes: number; taxa_acerto: number; classificacao: string | null; ultima_pratica: string | null }>(
        `student_kpi_materia?user_id=eq.${id}&questoes=gte.3&select=materia,questoes,taxa_acerto,classificacao,ultima_pratica&order=questoes.desc&limit=40`
      ),
      pget<{ topico: string; materia: string; taxa_acerto: number | null; proxima_revisao: string | null }>(
        `student_kpi_topico?user_id=eq.${id}&em_risco=eq.true&select=topico,materia,taxa_acerto,proxima_revisao&order=proxima_revisao.asc.nullslast&limit=6`
      ),
      pget<{ course_id: string | null }>(`lesson_progress?student_id=eq.${id}&is_completed=eq.true&select=course_id&limit=10000`),
      pget<{ last_watched_at: string | null; lesson: { title: string } | null }>(
        `lesson_progress?student_id=eq.${id}&select=last_watched_at,lesson:lessons(title)&order=last_watched_at.desc.nullslast&limit=1`
      ),
      prpc<unknown>('kpi_simulados_aluno', { p_user: aluno.id }),
    ]);

  const u = user[0];
  const s = student[0];
  const k = kpi[0];
  const L: string[] = [];

  L.push(`ALUNO: ${aluno.nome || s?.name || u?.full_name || '(sem nome)'} — e-mail ${mascararEmail(aluno.email)} — identificado por ${aluno.como}.`);
  if (s?.account_status && s.account_status !== 'active') L.push(`⚠️ Conta no Study: ${s.account_status} (sem acesso).`);
  const ultimo = [s?.last_access_at, k?.ultima_atividade as string | null, ultimaAula[0]?.last_watched_at].filter(Boolean).sort().pop();
  if (ultimo) L.push(`Última atividade na plataforma: ${dataBr(String(ultimo))}${ultimaAula[0]?.lesson?.title ? ` (última aula vista: ${ultimaAula[0].lesson.title})` : ''}.`);

  // Questões
  if (u) {
    const ativo = u.is_premium && (!u.plan_expires_at || u.plan_expires_at.slice(0, 10) >= hoje);
    L.push(`Monster Questões: ${ativo ? 'ativo' : 'sem plano ativo'}${u.plan_expires_at ? ` (até ${dataBr(u.plan_expires_at)})` : ''}${u.plan_name ? `, plano ${u.plan_name}` : ''}.`);
  }

  // Cursos — % de aulas recalculado (o campo da matrícula fica parado em 0%)
  const study = matriculas.filter((m) => m.course?.platform !== 'fagenius');
  const feitasPorCurso = new Map<string, number>();
  for (const c of concluidas) if (c.course_id) feitasPorCurso.set(c.course_id, (feitasPorCurso.get(c.course_id) ?? 0) + 1);
  const totais = await Promise.all(
    study.map((m) => pcount(`course_lessons?course_id=eq.${enc(m.course_id)}&is_active=eq.true&select=id`))
  );
  if (study.length) {
    L.push('CURSOS:');
    study.forEach((m, i) => {
      const feitas = feitasPorCurso.get(m.course_id) ?? 0;
      const total = totais[i];
      const pct = total ? ` (${Math.round((feitas / total) * 100)}%)` : '';
      L.push(
        `- ${m.course?.name ?? m.course_id} (id ${m.course_id}): ${acessoValido(m, hoje) ? 'acesso ativo' : 'SEM acesso'}${
          m.access_end_date ? ` até ${dataBr(m.access_end_date)}` : ''
        }; ${feitas}${total ? ` de ${total}` : ''} aulas concluídas${pct}.`
      );
    });
  } else {
    L.push('CURSOS: nenhuma matrícula no Study.');
  }

  // Cronograma (JSON do aluno)
  const plano = (s?.generated_schedule_tasks ?? []).filter((t) => !t.is_break && t.date);
  if (plano.length) {
    const feitas = plano.filter((t) => t.status === 'concluido').length;
    const atrasadas = plano.filter((t) => t.date < hoje && t.status !== 'concluido').sort((a, b) => a.date.localeCompare(b.date));
    const deHoje = plano.filter((t) => t.date === hoje);
    const proximas = plano.filter((t) => t.date > hoje && t.status !== 'concluido').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
    const devidas = plano.filter((t) => t.date <= hoje).length;
    L.push(
      `CRONOGRAMA: de ${dataBr(s?.schedule_start_date) || '?'} a ${dataBr(s?.schedule_end_date) || '?'}; ${feitas} de ${plano.length} tarefas concluídas no plano todo; até hoje eram ${devidas}, ${atrasadas.length} estão atrasadas.`
    );
    if (s?.daily_availability) {
      const disp = Object.entries(s.daily_availability).map(([d, h]) => `${d} ${h}h`).join(', ');
      L.push(`Disponibilidade cadastrada: ${disp}.`);
    }
    if (atrasadas.length) L.push(`Atrasadas mais antigas: ${atrasadas.slice(0, 3).map((t) => `${dataBr(t.date)} ${tarefaTxt(t)}`).join('; ')}.`);
    if (deHoje.length) L.push(`Hoje: ${deHoje.slice(0, 8).map((t) => `${tarefaTxt(t)}${t.status === 'concluido' ? ' (feita)' : ''}`).join('; ')}.`);
    if (proximas.length) L.push(`Próximas: ${proximas.map((t) => `${dataBr(t.date)} ${tarefaTxt(t)}`).join('; ')}.`);
  } else {
    L.push('CRONOGRAMA: não gerado.');
  }

  // Desempenho em questões
  if (k?.questoes_total) {
    L.push(
      `QUESTÕES: ${k.questoes_total} resolvidas, ${Math.round(Number(k.taxa_acerto ?? 0))}% de acerto${
        k.streak_atual ? `, ofensiva de ${k.streak_atual} dias` : ''
      }.`
    );
    const fracas = materias.filter((m) => m.classificacao === 'fraco').slice(0, 4);
    const fortes = materias.filter((m) => m.classificacao === 'forte').slice(0, 4);
    if (fracas.length) L.push(`Matérias fracas: ${fracas.map((m) => `${m.materia} ${Math.round(m.taxa_acerto)}% (${m.questoes} q.)`).join('; ')}.`);
    if (fortes.length) L.push(`Matérias fortes: ${fortes.map((m) => `${m.materia} ${Math.round(m.taxa_acerto)}% (${m.questoes} q.)`).join('; ')}.`);
    if (emRisco.length) L.push(`Tópicos em risco (revisar): ${emRisco.map((t) => `${t.topico} (${t.materia})`).join('; ')}.`);
  } else {
    L.push('QUESTÕES: ainda não resolveu questões suficientes para medir desempenho.');
  }

  // Simulados (formato da RPC varia: mostra o essencial que vier)
  const sims = Array.isArray(simulados) ? (simulados as Array<Record<string, unknown>>).slice(0, 3) : [];
  if (sims.length) L.push(`SIMULADOS recentes: ${JSON.stringify(sims).slice(0, 600)}`);

  return L.join('\n');
}

// ── conteúdo do curso ────────────────────────────────────────────────────────

function semAcento(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ');
}

/** Mesmo assunto com nomes diferentes no curso e no edital. */
const SINONIMOS: Array<[RegExp, string]> = [
  [/\blingua portuguesa\b|\bportugues\b/g, 'portugues'],
  [/\bnocoes de informatica\b|\binformatica\b/g, 'informatica'],
  [/\braciocinio logico( matematico)?\b/g, 'raciocinio'],
  [/\bmatematica\b/g, 'matematica'],
];
const GENERICAS = new Set(['direito', 'nocoes', 'conhecimentos', 'gerais', 'especificos', 'legislacao', 'basica', 'basico', 'estado']);

function palavrasDisciplina(t: string): Set<string> {
  let n = semAcento(t);
  for (const [re, canon] of SINONIMOS) n = n.replace(re, ` ${canon} `);
  return new Set(n.split(/\s+/).filter((w) => w.length >= 4 && !GENERICAS.has(w)));
}

/**
 * "Língua Portuguesa" bate com "Português - Sidoka"; "Noções de Informática"
 * com "Informática". O filtro por nome exato fazia a IA concluir que o curso
 * do CBMBA não tinha Português — tinha duas disciplinas.
 */
export function disciplinaBate(filtro: string, nome: string): boolean {
  const a = semAcento(filtro).trim();
  const b = semAcento(nome);
  if (a && b.includes(a)) return true;
  const fa = palavrasDisciplina(filtro);
  const fb = palavrasDisciplina(nome);
  return [...fa].some((w) => fb.has(w));
}

type Curso = { id: string; name: string };

/** Curso pelo id ou pelo nome (entre os cursos do aluno primeiro, depois todos os do Study). */
export async function acharCurso(ref: string, cursosDoAluno: Curso[] = []): Promise<Curso[]> {
  const r = ref.trim();
  if (/^[0-9a-f-]{36}$/i.test(r)) {
    return pget<Curso>(`courses?id=eq.${enc(r)}&select=id,name`);
  }
  const doAluno = matchByName(r, cursosDoAluno);
  if (doAluno.length) return doAluno;
  const todos = await pget<Curso>(`courses?platform=eq.monster_study&is_active=eq.true&select=id,name`);
  return matchByName(r, todos);
}

/**
 * Disciplinas → tópicos (com nº de aulas) do curso, como o aluno vê no Study:
 * nome personalizado do curso quando existe, ordem do curso, só o que está ativo.
 */
export async function conteudoCurso(courseId: string, disciplina?: string): Promise<string> {
  const id = enc(courseId);
  const [subs, tops, aulas] = await Promise.all([
    pget<{ subject_id: string; order_index: number; custom_name: string | null; subject: { name: string } | null }>(
      `course_subjects?course_id=eq.${id}&select=subject_id,order_index,custom_name,subject:subjects(name)&order=order_index`
    ),
    pget<{ topic_id: string; subject_id: string; custom_name: string | null; release_days_after_enrollment: number | null; topic: { name: string } | null }>(
      `course_topics?course_id=eq.${id}&is_active=eq.true&select=topic_id,subject_id,custom_name,release_days_after_enrollment,topic:topics(name)&order=order_index&limit=1000`
    ),
    pget<{ lesson: { topic_id: string; is_active: boolean | null } | null }>(
      `course_lessons?course_id=eq.${id}&is_active=eq.true&select=lesson:lessons(topic_id,is_active)&limit=5000`
    ),
  ]);
  const aulasPorTopico = new Map<string, number>();
  for (const a of aulas) {
    if (a.lesson?.topic_id && a.lesson.is_active !== false) {
      aulasPorTopico.set(a.lesson.topic_id, (aulasPorTopico.get(a.lesson.topic_id) ?? 0) + 1);
    }
  }
  const nomeDe = (s: (typeof subs)[number]) => s.custom_name || s.subject?.name || 'Disciplina';
  let filtro = disciplina?.trim();
  if (filtro && !subs.some((s) => disciplinaBate(filtro!, nomeDe(s)))) {
    // Sem correspondência: devolve tudo, para o modelo casar sinônimos — nunca "não tem".
    filtro = undefined;
  }
  const L: string[] = [];
  if (disciplina?.trim() && !filtro) {
    L.push(`(Nenhuma disciplina com nome parecido com "${disciplina}" — abaixo, todas as disciplinas do curso; confira se o assunto está com outro nome antes de dizer que falta.)`);
  }
  for (const s of subs) {
    const nome = nomeDe(s);
    if (filtro && !disciplinaBate(filtro, nome)) continue;
    const ts = tops.filter((t) => t.subject_id === s.subject_id);
    L.push(`## ${nome} (${ts.length} tópicos)`);
    for (const t of ts) {
      const n = aulasPorTopico.get(t.topic_id) ?? 0;
      const libera = t.release_days_after_enrollment ? `, libera ${t.release_days_after_enrollment} dias após a matrícula` : '';
      L.push(`- ${t.custom_name || t.topic?.name || 'tópico'} (${n} aula${n === 1 ? '' : 's'}${libera})`);
    }
  }
  if (!L.length) return 'Curso sem disciplinas cadastradas.';
  return L.join('\n');
}

/** Conteúdo programático da ficha do edital (base de concursos), para comparar com o curso. */
export async function conteudoProgramaticoEdital(refFicha: string, disciplina?: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('concurso_kb').select('titulo, edicao, url, dados').eq('fonte', 'ficha').eq('ref', refFicha).maybeSingle();
  const cp = (data?.dados as { conteudo_programatico?: Array<{ disciplina?: string; topicos_texto?: string }> } | null)?.conteudo_programatico;
  if (!cp?.length) return null;
  const filtro = disciplina?.trim();
  const escolhidas = filtro ? cp.filter((c) => disciplinaBate(filtro, c.disciplina ?? '')) : cp;
  const usar = escolhidas.length ? escolhidas : cp;
  const blocos = usar.map((c) => `## ${c.disciplina}\n${(c.topicos_texto ?? '').slice(0, escolhidas.length && filtro ? 6000 : 1200)}`);
  const cab = `${data?.titulo}${data?.edicao === 'anterior' ? ' — ATENÇÃO: EDIÇÃO ANTERIOR' : ''}${data?.url ? ` | ${data.url}` : ''}`;
  return `${cab}\n${blocos.join('\n\n')}`;
}
