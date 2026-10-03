/**
 * Ferramentas do agente sobre o ALUNO (consultar_aluno) e o CURSO
 * (consultar_conteudo_curso). Ficam aqui para o agent.ts só despachar.
 */
import { pget } from '../integrations/platform-access';
import {
  acharCurso,
  conteudoCurso,
  conteudoProgramaticoEdital,
  identificarAluno,
  resumoAluno,
} from '../integrations/platform-student';
import type { AlunoIdentificado } from '../integrations/platform-student';
import { searchConcursoKb } from './concurso-kb';

export interface ContextoContato {
  contactId?: string;
  contactPhone?: string;
}

async function cpfConfere(alunoId: string, cpf: string): Promise<boolean> {
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length < 3) return false;
  const [s] = await pget<{ cpf: string | null }>(`students?id=eq.${encodeURIComponent(alunoId)}&select=cpf`);
  const salvo = (s?.cpf ?? '').replace(/\D/g, '');
  return !!salvo && salvo.endsWith(digitos.slice(-3));
}

async function alunoDoContato(ctx: ContextoContato, email?: string) {
  return identificarAluno({ contactId: ctx.contactId, phone: ctx.contactPhone, emailInformado: email });
}

export async function toolConsultarAluno(
  ctx: ContextoContato,
  input: { email?: string; cpf?: string }
): Promise<string> {
  const r = await alunoDoContato(ctx, input.email);
  if (r.tipo === 'nenhum') {
    return 'Aluno não encontrado na plataforma por este telefone/contato. Peça o e-mail usado na compra e chame consultar_aluno de novo com ele. (Pode ser lead, ainda sem compra.)';
  }
  if (r.tipo === 'varios') {
    return `Mais de um cadastro para este contato: ${r.candidatos
      .map((c) => c.email?.replace(/^(.{2}).*@/, '$1***@') ?? c.id)
      .join(', ')}. Pergunte qual e-mail ele usa na plataforma e chame de novo com o e-mail.`;
  }
  const aluno: AlunoIdentificado = r.aluno;
  // E-mail digitado na conversa pode ser de outra pessoa: dados de estudo só com o CPF conferido.
  if (aluno.como === 'email informado') {
    if (!input.cpf) {
      return `Cadastro encontrado pelo e-mail informado (${aluno.email?.replace(/^(.{2}).*@/, '$1***@')}). Para falar de cursos, cronograma ou desempenho, peça os 3 últimos dígitos do CPF e chame consultar_aluno de novo com email e cpf. Para acesso/login, siga com verificar_acesso_plataforma.`;
    }
    if (!(await cpfConfere(aluno.id, input.cpf))) {
      return 'O CPF informado não confere com o cadastro desse e-mail. Não passe dados do aluno; peça para conferir o e-mail da compra.';
    }
  }
  return resumoAluno(aluno);
}

export async function toolConsultarConteudoCurso(
  ctx: ContextoContato,
  input: { curso?: string; disciplina?: string; comparar_edital?: boolean }
): Promise<string> {
  const ref = (input.curso ?? '').trim();
  // Cursos do aluno ajudam a resolver "meu curso" / nomes curtos.
  let doAluno: Array<{ id: string; name: string }> = [];
  const r = await alunoDoContato(ctx);
  if (r.tipo === 'achado') {
    const ms = await pget<{ course_id: string; course: { name: string; platform: string | null } | null }>(
      `student_course_enrollments?student_id=eq.${encodeURIComponent(r.aluno.id)}&select=course_id,course:courses(name,platform)`
    );
    doAluno = ms.filter((m) => m.course && m.course.platform !== 'fagenius').map((m) => ({ id: m.course_id, name: m.course!.name }));
  }
  let cursos = ref ? await acharCurso(ref, doAluno) : doAluno;
  if (!cursos.length && doAluno.length === 1) cursos = doAluno;
  if (!cursos.length) return `Não encontrei curso no Study para "${ref}". Confira o nome com buscar_produto.`;
  if (cursos.length > 1) {
    return `Mais de um curso bate com "${ref || 'o aluno'}": ${cursos.slice(0, 6).map((c) => `${c.name} (id ${c.id})`).join('; ')}. Pergunte qual, ou chame de novo com o id.`;
  }
  const curso = cursos[0];
  const partes = [`CURSO: ${curso.name}\n${await conteudoCurso(curso.id, input.disciplina)}`];

  if (input.comparar_edital) {
    const hits = await searchConcursoKb(`conteúdo programático ${input.disciplina ?? ''}`.trim(), curso.name);
    const fichas = hits.filter((h) => h.fonte === 'ficha');
    const ficha = fichas.find((h) => h.edicao !== 'anterior') ?? fichas[0];
    const edital = ficha ? await conteudoProgramaticoEdital(ficha.ref, input.disciplina) : null;
    partes.push(
      edital
        ? `CONTEÚDO PROGRAMÁTICO DO EDITAL (ficha extraída do PDF): ${edital}

` +
            'OBS.: não existe registro de qual edital orientou a montagem do curso nem do motivo de cada matéria. Compare o que o curso tem com o que este edital pede; não diga que o curso foi montado com base nele.'
        : 'Não há ficha do edital deste concurso com conteúdo programático na base. Não compare de memória; diga que vai confirmar com a equipe pedagógica.'
    );
  }
  return partes.join('\n\n');
}
