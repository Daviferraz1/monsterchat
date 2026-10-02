/**
 * Base de concursos para a IA (tabela concurso_kb, migração 062).
 *
 * A IA respondia "não tenho acesso ao edital" para o que a casa já documenta.
 * Aqui ficam o sync das fontes que moram no Supabase da plataforma (posts do
 * blog e editais curados) e a busca usada pela ferramenta buscar_concurso.
 * Fichas e trechos de PDF chegam pelo concurso-monitor (scraper/edital_kb.py),
 * que lê os PDFs; o embedding de tudo é feito aqui, em embedPending.
 */
import { createHash } from 'crypto';
import { supabaseAdmin } from '../supabase';
import { pget } from '../integrations/platform-access';
import { embedBatch, embedText, isEmbeddingsEnabled } from './embeddings';

const SITE = 'https://www.monsterconcursos.com.br';

const SITUACAO: Record<string, string> = {
  previsto: 'previsto (autorizado/anunciado, sem edital)',
  comissao_formada: 'comissão formada (sem edital)',
  banca_definida: 'banca definida (sem edital)',
  edital_publicado: 'edital publicado',
  inscricoes_abertas: 'inscrições abertas',
  inscricoes_encerradas: 'inscrições encerradas',
  prova_aplicada: 'prova aplicada',
  resultado: 'resultado divulgado',
  suspenso: 'suspenso',
};

export interface KbRow {
  fonte: 'blog' | 'edital' | 'ficha' | 'trecho';
  ref: string;
  titulo: string;
  orgao?: string | null;
  uf?: string | null;
  cargo?: string | null;
  situacao?: string | null;
  edicao?: 'atual' | 'anterior' | null;
  data_prova?: string | null;
  inscricao_ate?: string | null;
  url?: string | null;
  pagina?: number | null;
  texto: string;
  dados?: unknown;
  hash: string;
  fonte_data?: string | null;
}

function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

function linhas(...partes: Array<string | null | undefined | false>): string {
  return partes.filter((p): p is string => !!p && !!p.trim()).join('\n');
}

// ── blog ─────────────────────────────────────────────────────────────────────

type Bloco = Record<string, any>;

/** Corpo do post (blocos tipados do site) → texto corrido. Imagem e CTA não carregam fato. */
function corpoTexto(corpo: unknown): string {
  if (!Array.isArray(corpo)) return '';
  const out: string[] = [];
  for (const b of corpo as Bloco[]) {
    switch (b?.t) {
      case 'p':
      case 'alerta':
        out.push(String(b.txt ?? ''));
        break;
      case 'h2':
        out.push(`## ${b.txt ?? ''}`);
        break;
      case 'ul':
      case 'etapas':
        for (const i of b.items ?? []) out.push(`- ${i}`);
        break;
      case 'destaques':
        out.push((b.itens ?? []).map((i: Bloco) => `${i.valor} ${i.rotulo}`).join(' | '));
        break;
      case 'timeline':
        for (const i of b.itens ?? []) out.push(`- ${i.data}: ${i.evento}`);
        break;
      case 'ficha':
        for (const [k, v] of b.rows ?? []) out.push(`${k}: ${v}`);
        break;
      case 'tabela':
        out.push((b.colunas ?? []).join(' | '));
        for (const l of b.linhas ?? []) out.push((l ?? []).join(' | '));
        break;
      case 'materias': {
        const origem = b.fonte === 'anterior' ? ` (edital da edição ANTERIOR${b.ano ? `, ${b.ano}` : ''})` : '';
        out.push(`Matérias da prova objetiva${origem}:`);
        for (const i of b.itens ?? []) out.push(`- ${i.nome}: ${i.questoes ?? '?'} questões`);
        break;
      }
    }
  }
  return out.join('\n');
}

type BlogPost = {
  slug: string;
  titulo: string;
  subtitulo: string | null;
  resumo: string | null;
  corpo: unknown;
  uf: string | null;
  orgao: string | null;
  banca: string | null;
  cargos: string | null;
  escolaridade: string | null;
  vagas_texto: string | null;
  salario_texto: string | null;
  inscricao_ate: string | null;
  data_prova: string | null;
  situacao: string | null;
  fonte_nome: string | null;
  edital_url: string | null;
  publicado_em: string | null;
  atualizado_em: string | null;
};

function blogRow(p: BlogPost): KbRow {
  const texto = linhas(
    p.subtitulo,
    p.resumo,
    p.situacao && `Situação: ${SITUACAO[p.situacao] ?? p.situacao}`,
    p.orgao && `Órgão: ${p.orgao}`,
    p.banca && `Banca: ${p.banca}`,
    p.cargos && `Cargos: ${p.cargos}`,
    p.escolaridade && `Escolaridade: ${p.escolaridade}`,
    p.vagas_texto && `Vagas: ${p.vagas_texto}`,
    p.salario_texto && `Salário: ${p.salario_texto}`,
    p.inscricao_ate && `Inscrições até: ${p.inscricao_ate}`,
    p.data_prova && `Prova: ${p.data_prova}`,
    p.edital_url && `Edital (PDF): ${p.edital_url}`,
    p.fonte_nome && `Fonte da notícia: ${p.fonte_nome}`,
    corpoTexto(p.corpo)
  );
  return {
    fonte: 'blog',
    ref: p.slug,
    titulo: p.titulo,
    orgao: p.orgao,
    uf: p.uf,
    cargo: p.cargos,
    situacao: p.situacao,
    data_prova: p.data_prova,
    inscricao_ate: p.inscricao_ate,
    url: `${SITE}/blog/${p.slug}`,
    texto,
    dados: { edital_url: p.edital_url, banca: p.banca },
    hash: sha1(p.titulo + texto),
    fonte_data: p.atualizado_em ?? p.publicado_em,
  };
}

async function fetchBlog(): Promise<BlogPost[]> {
  const cols =
    'slug,titulo,subtitulo,resumo,corpo,uf,orgao,banca,cargos,escolaridade,vagas_texto,salario_texto,inscricao_ate,data_prova,situacao,fonte_nome,edital_url,publicado_em,atualizado_em';
  const out: BlogPost[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await pget<BlogPost>(
      `blog_posts?select=${cols}&arquivado=eq.false&order=id.asc&limit=500&offset=${offset}`
    );
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

// ── editais curados (Edital + Concurso) ──────────────────────────────────────

type Edital = {
  id: string;
  orgao_nome: string | null;
  orgao_sigla: string | null;
  banca: string | null;
  edital_numero: string | null;
  edital_arquivo_url: string | null;
  edital_arquivos: Array<{ nome?: string; url?: string }> | null;
  data_prova_inicio: string | null;
  updated_at: string | null;
};
type Concurso = {
  id: number;
  edital_id: string | null;
  nome: string;
  orgao: string | null;
  banca: string | null;
  cargo: string | null;
  status: string | null;
  vagas: number | null;
  salario: number | null;
  taxa_inscricao: number | null;
  data_prova: string | null;
  data_inscricao_inicio: string | null;
  data_inscricao_fim: string | null;
  updated_at: string | null;
};

function concursoLinha(c: Concurso): string {
  const brl = (n: number | null) => (n != null ? `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : null);
  return [
    `- ${c.cargo || c.nome}`,
    c.vagas != null && `${c.vagas} vagas`,
    brl(c.salario) && `salário ${brl(c.salario)}`,
    brl(c.taxa_inscricao) && `taxa ${brl(c.taxa_inscricao)}`,
    c.data_inscricao_inicio && `inscrições de ${c.data_inscricao_inicio}`,
    c.data_inscricao_fim && `até ${c.data_inscricao_fim}`,
    c.data_prova && `prova ${c.data_prova}`,
    c.status && `(${c.status})`,
  ]
    .filter(Boolean)
    .join(', ');
}

async function fetchEditais(): Promise<KbRow[]> {
  const [editais, concursos] = await Promise.all([
    pget<Edital>(
      'Edital?select=id,orgao_nome,orgao_sigla,banca,edital_numero,edital_arquivo_url,edital_arquivos,data_prova_inicio,updated_at&publicado=eq.true'
    ),
    pget<Concurso>(
      'Concurso?select=id,edital_id,nome,orgao,banca,cargo,status,vagas,salario,taxa_inscricao,data_prova,data_inscricao_inicio,data_inscricao_fim,updated_at'
    ),
  ]);
  const porEdital = new Map<string, Concurso[]>();
  for (const c of concursos) if (c.edital_id) porEdital.set(c.edital_id, [...(porEdital.get(c.edital_id) ?? []), c]);

  const rows: KbRow[] = [];
  for (const e of editais) {
    const cs = porEdital.get(e.id) ?? [];
    const pdfs = (e.edital_arquivos ?? []).filter((a) => a.url);
    const titulo = `Edital ${e.orgao_nome ?? e.orgao_sigla} ${e.edital_numero ?? ''}`.trim();
    const texto = linhas(
      `Órgão: ${e.orgao_nome ?? e.orgao_sigla}`,
      e.banca && `Banca: ${e.banca}`,
      e.edital_numero && `Edital: ${e.edital_numero}`,
      e.data_prova_inicio && `Prova: ${e.data_prova_inicio}`,
      cs.length > 0 && 'Cargos no edital:',
      ...cs.map(concursoLinha),
      pdfs.length > 0 && 'Arquivos do edital:',
      ...pdfs.map((a) => `- ${a.nome ?? 'arquivo'}: ${a.url}`)
    );
    rows.push({
      fonte: 'edital',
      ref: e.id,
      titulo,
      orgao: e.orgao_nome,
      cargo: cs.map((c) => c.cargo).filter(Boolean).join(', ') || null,
      situacao: 'edital_publicado',
      data_prova: cs.find((c) => c.data_prova)?.data_prova ?? e.data_prova_inicio,
      inscricao_ate: cs.find((c) => c.data_inscricao_fim)?.data_inscricao_fim ?? null,
      url: e.edital_arquivo_url ?? pdfs[0]?.url ?? null,
      texto,
      hash: sha1(titulo + texto),
      fonte_data: e.updated_at,
    });
  }
  // Concurso cadastrado sem edital ligado (previsto, ou edital ainda não curado).
  for (const c of concursos.filter((x) => !x.edital_id)) {
    const texto = linhas(c.orgao && `Órgão: ${c.orgao}`, c.banca && `Banca: ${c.banca}`, concursoLinha(c));
    rows.push({
      fonte: 'edital',
      ref: `concurso:${c.id}`,
      titulo: c.nome,
      orgao: c.orgao,
      cargo: c.cargo,
      situacao: c.status === 'previsto' ? 'previsto' : null,
      data_prova: c.data_prova,
      inscricao_ate: c.data_inscricao_fim,
      texto,
      hash: sha1(c.nome + texto),
      fonte_data: c.updated_at,
    });
  }
  return rows;
}

// ── gravação ─────────────────────────────────────────────────────────────────

/**
 * Grava as linhas de uma fonte: só reescreve o que mudou (hash), zerando o
 * embedding para ser refeito; apaga o que saiu da origem. `minimoEsperado`
 * protege contra apagar tudo quando a consulta à plataforma falha e volta vazia.
 */
async function gravarFonte(fonte: 'blog' | 'edital', rows: KbRow[], minimoEsperado: number) {
  if (rows.length < minimoEsperado) {
    throw new Error(`[concurso-kb] ${fonte}: só ${rows.length} itens da plataforma — sync abortado`);
  }
  const { data: existentes, error } = await supabaseAdmin.from('concurso_kb').select('ref, hash').eq('fonte', fonte);
  if (error) throw error;
  const hashes = new Map((existentes ?? []).map((r: { ref: string; hash: string | null }) => [r.ref, r.hash]));

  const mudaram = rows.filter((r) => hashes.get(r.ref) !== r.hash);
  for (let i = 0; i < mudaram.length; i += 200) {
    const lote = mudaram.slice(i, i + 200).map((r) => ({
      ...r,
      edicao: r.edicao ?? null,
      embedding: null,
      atualizado_em: new Date().toISOString(),
    }));
    const { error: e } = await supabaseAdmin.from('concurso_kb').upsert(lote, { onConflict: 'fonte,ref' });
    if (e) throw e;
  }

  const atuais = new Set(rows.map((r) => r.ref));
  const sairam = [...hashes.keys()].filter((ref) => !atuais.has(ref));
  for (let i = 0; i < sairam.length; i += 200) {
    await supabaseAdmin.from('concurso_kb').delete().eq('fonte', fonte).in('ref', sairam.slice(i, i + 200));
  }
  return { total: rows.length, atualizados: mudaram.length, removidos: sairam.length };
}

/** Embeddings pendentes, em lotes. Para no 429 do Gemini ou ao estourar o tempo. */
export async function embedPending(opts: { maxMs?: number } = {}) {
  if (!isEmbeddingsEnabled()) return { feitos: 0, motivo: 'GEMINI_API_KEY ausente' };
  const fim = Date.now() + (opts.maxMs ?? 200_000);
  let feitos = 0;
  while (Date.now() < fim) {
    const { data, error } = await supabaseAdmin
      .from('concurso_kb')
      .select('id, titulo, texto')
      .is('embedding', null)
      .limit(50);
    if (error) throw error;
    if (!data?.length) return { feitos, motivo: 'completo' };
    const { embeddings, status } = await embedBatch(
      data.map((r: { titulo: string; texto: string }) => `${r.titulo}\n${r.texto}`),
      'RETRIEVAL_DOCUMENT'
    );
    if (status === 429) return { feitos, motivo: 'limite do Gemini (429)' };
    let algum = false;
    for (let i = 0; i < data.length; i++) {
      const emb = embeddings[i];
      if (!emb) continue;
      algum = true;
      await supabaseAdmin.from('concurso_kb').update({ embedding: emb }).eq('id', data[i].id);
      feitos++;
    }
    if (!algum) return { feitos, motivo: `embedding falhou (HTTP ${status})` };
  }
  return { feitos, motivo: 'tempo esgotado' };
}

/** Sync completo das fontes da plataforma + embeddings pendentes (cron diário). */
export async function syncConcursoKb(opts: { maxEmbedMs?: number } = {}) {
  const [posts, editais] = await Promise.all([fetchBlog(), fetchEditais()]);
  const blog = await gravarFonte('blog', posts.map(blogRow), 50);
  const edital = await gravarFonte('edital', editais, 10);
  const embeddings = await embedPending({ maxMs: opts.maxEmbedMs });
  return { blog, edital, embeddings };
}

// ── busca (ferramenta buscar_concurso) ───────────────────────────────────────

export interface KbHit {
  fonte: KbRow['fonte'];
  ref: string;
  titulo: string;
  orgao: string | null;
  uf: string | null;
  cargo: string | null;
  situacao: string | null;
  edicao: string | null;
  data_prova: string | null;
  inscricao_ate: string | null;
  url: string | null;
  pagina: number | null;
  texto: string;
  fonte_data: string | null;
  score: number;
}

export async function searchConcursoKb(consulta: string, uf?: string): Promise<KbHit[]> {
  const q = consulta?.trim();
  if (!q) return [];
  const embedding = await embedText(q, 'RETRIEVAL_QUERY');
  const { data, error } = await supabaseAdmin.rpc('match_concurso_kb', {
    query_embedding: embedding,
    query_text: q,
    filtro_uf: uf?.trim() || null,
    filtro_fontes: null,
    match_count: 8,
  });
  if (error) {
    console.error('[concurso-kb] busca', error);
    return [];
  }
  return (data ?? []) as KbHit[];
}

const ROTULO_FONTE: Record<KbRow['fonte'], string> = {
  ficha: 'FICHA DO EDITAL (extraída do PDF oficial)',
  trecho: 'TRECHO DO EDITAL (PDF oficial)',
  edital: 'EDITAL CADASTRADO (plataforma)',
  blog: 'NOTÍCIA DO BLOG',
};

function dataBr(d: string | null): string {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Resultado da busca no formato que o agente lê: fonte, data e link de cada item. */
export function formatKbHits(hits: KbHit[], maxChars = 9000): string {
  if (!hits.length) {
    return 'Nada encontrado na base de concursos (blog, editais e fichas). Não afirme dados deste concurso; diga que vai confirmar com a equipe.';
  }
  const blocos: string[] = [];
  let usado = 0;
  for (const h of hits) {
    const cab = [
      `[${ROTULO_FONTE[h.fonte]}] ${h.titulo}`,
      [h.orgao, h.uf].filter(Boolean).join(' — '),
      h.situacao && `situação: ${SITUACAO[h.situacao] ?? h.situacao}`,
      h.edicao === 'anterior' && 'ATENÇÃO: EDIÇÃO ANTERIOR do concurso, não o edital atual',
      h.fonte_data && `atualizado em ${dataBr(h.fonte_data)}`,
      h.pagina != null && `página ${h.pagina}`,
      h.url && `link: ${h.url}`,
    ]
      .filter(Boolean)
      .join(' | ');
    const limite = h.fonte === 'trecho' ? 1800 : 2500;
    const corpo = h.texto.length > limite ? `${h.texto.slice(0, limite)}…` : h.texto;
    const bloco = `${cab}\n${corpo}`;
    if (usado + bloco.length > maxChars && blocos.length) break;
    blocos.push(bloco);
    usado += bloco.length;
  }
  return blocos.join('\n\n---\n\n');
}
