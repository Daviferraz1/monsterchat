/**
 * Mensagem de ausência do Instagram ("Olá, fulano, agradecemos a sua mensagem. Não estamos
 * disponíveis no momento, mas entraremos em contato em breve!").
 *
 * Quem dispara é o próprio Instagram, fora do horário configurado no app, e ela chega aqui
 * como echo igual a uma resposta digitada no celular. Gravada como resposta de atendente,
 * a conversa parecia respondida: o piloto pulava ("última mensagem não é do aluno") e a
 * pergunta do aluno ficava sem resposta a noite toda (10/10/2026).
 *
 * O echo não traz nenhum campo que diga que é automática, então a identificação é pelo texto.
 */
export const VIA_AUSENCIA = 'instagram_ausencia';

export function ehAusenciaInstagram(body: string | null | undefined): boolean {
  if (!body || body.length > 400) return false;
  const t = body.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /nao estamos disponiveis no momento|agradecemos a sua mensagem.{0,80}entraremos em contato/.test(t);
}
