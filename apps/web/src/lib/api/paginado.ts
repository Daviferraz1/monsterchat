import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Lê TODAS as linhas de uma consulta, em páginas.
 *
 * O PostgREST do Supabase corta qualquer resposta em `db-max-rows` — 1.000 linhas
 * neste projeto — e `.limit(20000)` NÃO muda isso: pede vinte mil, recebe mil, sem
 * erro, sem aviso e sem nenhum sinal de que faltou coisa.
 *
 * Visto em 22/09/2026, no primeiro disparo real da régua de recuperação: o
 * histórico que decide "esta pessoa já comprou este produto?" enxergava 1.000 de
 * 6.673 vendas aprovadas — e as 1.000 mais antigas, porque sem `order` a ordem é
 * a física da tabela. O filtro de pedido duplicado existia, rodava, e nunca batia
 * em ninguém. Ninguém recebeu mensagem errada naquele disparo por coincidência:
 * todo duplicado era checkout abandonado, e o template de abandonado ainda não
 * estava configurado. Não é uma proteção que se pode deixar apoiada em sorte.
 *
 * Use isto sempre que a decisão depender do conjunto COMPLETO (é aluno? já pagou?
 * já recebeu?), nunca de uma amostra. Para listar as N mais recentes de uma tela,
 * `.limit()` continua certo.
 *
 * `montar(de, ate)` devolve a consulta já com `.range(de, ate)`. A consulta
 * PRECISA ter um `.order()` estável: sem ordem definida, o banco pode devolver a
 * mesma linha em duas páginas e nunca devolver outra.
 */
export async function lerTudo<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  pagina = 1000
): Promise<T[]> {
  const tudo: T[] = [];
  // Teto de segurança: 200 páginas = 200 mil linhas. Se algum dia estourar, é
  // porque a consulta virou grande demais para ser resolvida na aplicação.
  for (let p = 0; p < 200; p++) {
    const de = p * pagina;
    const { data, error } = await montar(de, de + pagina - 1);
    if (error) throw error;
    // O tipo vem de quem chama: o builder do PostgREST devolve a forma do
    // `select` como `any`, e casar isso no genérico é o que mantém a checagem
    // do lado de fora, onde ela vale alguma coisa.
    const lote = (data ?? []) as T[];
    tudo.push(...lote);
    if (lote.length < pagina) return tudo;
  }
  console.warn(`[lerTudo] parei no teto de 200 páginas com ${tudo.length} linhas`);
  return tudo;
}
