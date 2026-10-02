/**
 * Quão parecida a mensagem enviada é da sugestão da IA.
 *
 * `was_used` só é true quando o atendente envia a sugestão sem mexer em nada.
 * Na prática ele cola, acrescenta "Bom dia!" ou troca um emoji e envia — e isso
 * contava como "não usou". Esta medida separa esse caso do descarte de verdade.
 */

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

/**
 * Palavras em comum ÷ palavras do texto maior (0–1). Dividir pelo maior evita
 * que uma sugestão curta ("Para qual concurso?") pareça igual a um texto longo
 * que por acaso contém as mesmas palavras.
 */
export function textSimilarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return common / Math.max(A.size, B.size);
}

export type SuggestionOutcome = 'exata' | 'quase_igual' | 'parcial' | 'descartada' | 'sem_texto';

export const NEAR_IDENTICAL = 0.8;
export const PARTIAL = 0.5;

export function classifyOutcome(row: {
  was_used: boolean | null;
  suggested_response: string | null;
  edited_response: string | null;
}): SuggestionOutcome {
  if (row.was_used) return 'exata';
  const sent = row.edited_response?.trim();
  if (!sent) return 'sem_texto';
  const s = textSimilarity(row.suggested_response ?? '', sent);
  if (s >= NEAR_IDENTICAL) return 'quase_igual';
  if (s >= PARTIAL) return 'parcial';
  return 'descartada';
}
