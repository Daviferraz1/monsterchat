/**
 * Pincel Atômico: portal acadêmico da Fagenius (Tecnólogo e Sequencial).
 *
 * Não temos acesso ao banco do Pincel; lemos as mesmas telas que a equipe abre no
 * navegador, com login de gestor por HTTP (o robô de enturmação usa o mesmo usuário):
 *  - aluno_buscar.php?buscar=<CPF|e-mail>   ficha resumida (nome, matrícula, situação)
 *  - aluno_interacoes.php?hash=<hash>       acessos ao portal e e-mails enviados
 *  - email_enviado_visualizar.php?id=<id>   corpo do e-mail ("Acesso ao Portal Acadêmico")
 *
 * Muitos alunos dizem que não receberam o e-mail de acesso; a equipe abria essas telas
 * e copiava usuário e senha para o WhatsApp (out/2026). Só leitura: nada aqui altera o Pincel.
 */

const BASE = 'https://fagenius.pincelatomico.net.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

let sessao: { cookie: string; ate: number } | null = null;

function pincelConfigurado(): boolean {
  return Boolean(process.env.PINCEL_USER && process.env.PINCEL_PASS);
}

function juntarCookies(atual: string, res: Response): string {
  const mapa = new Map<string, string>();
  for (const par of atual.split(/;\s*/).filter(Boolean)) {
    const i = par.indexOf('=');
    if (i > 0) mapa.set(par.slice(0, i), par.slice(i + 1));
  }
  const novos = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of novos) {
    const par = c.split(';')[0];
    const i = par.indexOf('=');
    if (i > 0) mapa.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
  return [...mapa].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function lerHtml(res: Response): Promise<string> {
  // Umas telas do Pincel vêm em ISO-8859-1, outras em UTF-8.
  const buf = await res.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

async function login(): Promise<string> {
  const r1 = await fetch(`${BASE}/`, { headers: { 'User-Agent': UA }, redirect: 'manual' });
  let cookie = juntarCookies('', r1);
  const csrf = (await lerHtml(r1)).match(/name="csrf_login" value="([^"]+)"/)?.[1];
  if (!csrf) throw new Error('Pincel: tela de login mudou (sem csrf_login)');
  const corpo = new URLSearchParams({
    csrf_login: csrf,
    aula: '',
    email_extra: '', // honeypot: tem de ir vazio
    usuario: process.env.PINCEL_USER ?? '',
    senha: process.env.PINCEL_PASS ?? '',
  });
  const r2 = await fetch(`${BASE}/index.php`, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: corpo.toString(),
    redirect: 'manual',
  });
  cookie = juntarCookies(cookie, r2);
  const destino = r2.headers.get('location') ?? '';
  if (!/indexGestor|acesso\//i.test(destino)) throw new Error('Pincel: login recusado');
  sessao = { cookie, ate: Date.now() + 20 * 60_000 };
  return cookie;
}

/** GET autenticado; refaz o login uma vez se a sessão caiu. */
async function pagina(caminho: string): Promise<string> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const cookie = sessao && sessao.ate > Date.now() && tentativa === 0 ? sessao.cookie : await login();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(`${BASE}/acesso/${caminho}`, {
      headers: { 'User-Agent': UA, Cookie: cookie },
      redirect: 'manual',
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    const html = res.status === 200 ? await lerHtml(res) : '';
    if (html && !html.includes('csrf_login')) return html;
    sessao = null;
  }
  throw new Error('Pincel: não foi possível abrir ' + caminho.split('?')[0]);
}

function texto(h: string): string {
  return h
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|tr|div|li|td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** O Cloudflare troca e-mails por data-cfemail (XOR com o primeiro byte). */
function decodificarCfEmail(hex: string): string {
  const k = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return out;
}

function emailsDoTrecho(h: string): string[] {
  return [...h.matchAll(/data-cfemail="([0-9a-f]+)"/gi)].map((m) => decodificarCfEmail(m[1]).toLowerCase());
}

export interface AlunoPincel {
  nome: string;
  matricula: string;
  cpf: string; // só dígitos
  emails: string[];
  situacao: string[]; // "Usuário Ativo", "Cursando"…
  hash: string;
}

export async function buscarAlunoPincel(termo: string): Promise<AlunoPincel[]> {
  const html = await pagina(`aluno_buscar.php?buscar=${encodeURIComponent(termo.trim())}`);
  const blocos = html.split(/<ul class="activity"/i).slice(1);
  const alunos: AlunoPincel[] = [];
  for (const b of blocos) {
    const hash = b.match(/aluno_ficha\.php\?hash=([0-9a-f]{32})/i)?.[1];
    if (!hash) continue;
    alunos.push({
      nome: texto(b.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] ?? '').trim(),
      matricula: b.match(/Matr\S*cula:<\/b>\s*([\w.-]+)/i)?.[1] ?? '',
      cpf: (b.match(/CPF:<\/b>\s*([\d.\-]+)/i)?.[1] ?? '').replace(/\D/g, ''),
      emails: emailsDoTrecho(b.split(/Filia/i)[0]),
      situacao: [...b.matchAll(/data-original-title="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((t) => /ativo|inativo|cursando|trancad|cancelad|formad|conclu|evadid|bloque|desist|transfer/i.test(t)),
      hash,
    });
  }
  return alunos;
}

function linhasDaTabela(html: string, id: string): string[][] {
  const t = html.split(`id="${id}"`)[1]?.split('</table>')[0] ?? '';
  return [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((td) => td[1])
  );
}

export interface InteracoesPincel {
  acessos: string[]; // "09/10/2026 15:18:07", mais recente primeiro
  emails: Array<{ id: string; data: string; para: string; assunto: string }>;
}

export async function interacoesPincel(hash: string): Promise<InteracoesPincel> {
  const html = await pagina(`aluno_interacoes.php?hash=${hash}`);
  const acessos = [...new Set(linhasDaTabela(html, 'tabela-acessos').map((c) => texto(c[0] ?? '')).filter(Boolean))];
  const emails = linhasDaTabela(html, 'tabela-envioemail')
    .map((c) => ({
      data: texto(c[0] ?? ''),
      para: emailsDoTrecho(c[1] ?? '')[0] ?? texto(c[1] ?? ''),
      assunto: texto(c[2] ?? ''),
      id: (c[3] ?? '').match(/email_enviado_visualizar\.php\?id=(\d+)/)?.[1] ?? '',
    }))
    .filter((e) => e.id);
  return { acessos, emails };
}

export async function emailPincel(id: string): Promise<string> {
  const t = texto(await pagina(`email_enviado_visualizar.php?id=${encodeURIComponent(id)}`));
  return t.replace(/^E-mail Pincel At\S*mico\s*/i, '').split(/DATA \/ HORA ENVIO/i)[0].trim();
}

/** Usuário e senha inicial do e-mail "Acesso ao Portal Acadêmico". */
function credenciaisDoEmail(corpo: string): { usuario?: string; senha?: string } {
  // Corpo: "... senha inicial abaixo:\n Usuário \n 755022 \n Senha \n xxxx \n Altere sua senha..."
  const m = corpo.match(/Usu\S*rio\s*\n\s*(\S+)\s*\n\s*Senha\s*\n\s*(\S+)/i);
  const usuario = m?.[1];
  const senha = m?.[2];
  return { usuario, senha };
}

/**
 * Texto para a IA: situação do aluno no portal da Fagenius, último acesso, e-mails
 * enviados e, se houver, usuário e senha inicial do e-mail de acesso.
 */
export async function consultarPortalFagenius(params: { email?: string; cpf?: string }): Promise<string> {
  if (!pincelConfigurado()) return 'Consulta ao portal da Fagenius (Pincel) não configurada: faltam PINCEL_USER/PINCEL_PASS.';
  const cpf = (params.cpf ?? '').replace(/\D/g, '');
  const email = (params.email ?? '').trim().toLowerCase();
  if (cpf.length !== 11 && !email.includes('@')) return 'Informe o CPF ou o e-mail do aluno para consultar o portal da Fagenius.';

  let alunos = cpf.length === 11 ? await buscarAlunoPincel(cpf) : [];
  if (!alunos.length && email) alunos = await buscarAlunoPincel(email);
  // A busca do Pincel é por trecho; fica só quem bate exatamente com o que o aluno informou.
  alunos = alunos.filter((a) => (cpf.length === 11 && a.cpf === cpf) || (email && a.emails.includes(email)));
  if (!alunos.length) {
    return 'Nenhum aluno no portal da Fagenius (Pincel) com esse CPF/e-mail. Se ele já pagou, a matrícula pode ainda não ter sido feita (a enturmação é automática após o pagamento): confira o pagamento e, se aprovado há mais de 1 dia, passe para a equipe.';
  }

  const blocos: string[] = [];
  for (const a of alunos.slice(0, 2)) {
    const inter = await interacoesPincel(a.hash);
    const linhas = [
      `Aluno no portal Fagenius: ${a.nome} | matrícula ${a.matricula}${a.situacao.length ? ` | ${a.situacao.join(', ')}` : ''}`,
      inter.acessos.length ? `Último acesso ao portal: ${inter.acessos[0]}` : 'NUNCA acessou o portal.',
    ];
    if (inter.emails.length) {
      linhas.push('E-mails enviados pelo portal (mais recente primeiro):');
      for (const e of inter.emails.slice(0, 6)) linhas.push(`- ${e.data} | ${e.assunto} | para ${e.para}`);
    } else {
      linhas.push('O portal ainda NÃO enviou nenhum e-mail para esse aluno.');
    }
    const acesso = inter.emails.find((e) => /acesso ao portal/i.test(e.assunto));
    if (acesso) {
      const { usuario, senha } = credenciaisDoEmail(await emailPincel(acesso.id));
      if (usuario) {
        linhas.push(
          `Dados do e-mail "Acesso ao Portal Acadêmico" (${acesso.data}): usuário ${usuario}${senha ? ` | senha inicial ${senha}` : ''}. ` +
            `Portal: https://fagenius.pincelatomico.net.br (entrar com a matrícula ou o CPF). ` +
            (inter.acessos.length
              ? 'O aluno JÁ acessou o portal, então pode ter trocado a senha: se a inicial não funcionar, oriente "Esqueci minha senha" na tela de login.'
              : 'Ele nunca acessou: a senha inicial deve funcionar; peça para trocar no primeiro acesso.')
        );
      }
    }
    const aceite = inter.emails.find((e) => /aceite de contrato/i.test(e.assunto));
    if (aceite && aceite === inter.emails[0]) {
      const codigo = (await emailPincel(aceite.id)).match(/c\S*digo\s+(\d{3,8})/i)?.[1];
      if (codigo) linhas.push(`Último código de aceite de contrato (${aceite.data}): ${codigo}.`);
    }
    blocos.push(linhas.join('\n'));
  }
  return blocos.join('\n\n');
}
