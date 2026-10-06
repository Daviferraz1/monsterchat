/**
 * Autocompletar sem IA: compara o que está sendo digitado com o começo das frases
 * que a equipe mais usa (/api/ia/frases) e devolve o resto da mais usada.
 * Ignora maiúscula e acento ("voce" acha "Você"), mas a sugestão sai com a grafia
 * da frase original.
 */

export interface FraseIndexada {
  texto: string;
  /** Mesmo tamanho de `texto`, caractere a caractere: minúsculo e sem acento. */
  dobrado: string;
  vezes: number;
  /** Mensagem inteira (várias linhas) ou frase solta. */
  inteira: boolean;
}

/** Dobra caractere a caractere, sem mudar o tamanho (para recortar a original depois). */
export function dobrar(s: string): string {
  let out = '';
  for (const c of s) {
    const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const d = (base || c).toLowerCase();
    // Manter o tamanho: se a dobra mudou o número de unidades, fica o original.
    out += d.length === c.length ? d : c;
  }
  return out;
}

export function indexar(frases: Array<[string, number]>): FraseIndexada[] {
  return frases.map(([texto, vezes]) => ({ texto, dobrado: dobrar(texto), vezes, inteira: texto.includes('\n') }));
}

const MIN_DIGITADO = 4;

/** Trecho em andamento: depois da última quebra de linha ou fim de frase. */
function fraseAtual(texto: string): string {
  let inicio = 0;
  for (const m of texto.matchAll(/\n|[.!?]\s+/g)) inicio = m.index! + m[0].length;
  return texto.slice(inicio).replace(/^\s+/, '');
}

function melhor(alvo: string, frases: FraseIndexada[], soInteiras: boolean): string {
  if (alvo.trim().length < MIN_DIGITADO) return '';
  const d = dobrar(alvo);
  let achada: FraseIndexada | null = null;
  for (const f of frases) {
    if (soInteiras !== f.inteira) continue;
    if (f.texto.length <= alvo.length || !f.dobrado.startsWith(d)) continue;
    if (!achada || f.vezes > achada.vezes) achada = f;
  }
  return achada ? achada.texto.slice(alvo.length) : '';
}

/**
 * O resto sugerido para `texto`, ou ''. Primeiro tenta a mensagem inteira (a
 * abertura, por exemplo, tem cinco linhas); depois só a frase em andamento.
 */
export function sugerirContinuacao(texto: string, frases: FraseIndexada[]): string {
  if (!texto) return '';
  const inteira = melhor(texto, frases, true);
  if (inteira) return inteira;
  return melhor(fraseAtual(texto), frases, false);
}
