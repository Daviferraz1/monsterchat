/**
 * Badge de situação de pedido (Digital Guru) para exibição ao atendente.
 * Usado no ChatHeader e na lista de conversas.
 */

export const STATUS_LABELS_PT: Record<string, { label: string; shortLabel: string }> = {
  billet_printed: { label: 'Boleto emitido', shortLabel: 'Boleto emitido' },
  waiting_payment: { label: 'Aguardando pagamento', shortLabel: 'Aguard. pagamento' },
  payment_pending: { label: 'Pagamento pendente', shortLabel: 'Pendente' },
};

export function orderStatusBadge(
  status: string | null | undefined
): { label: string; className: string; shortLabel: string } {
  const s = (status ?? '').toLowerCase();
  if (['approved', 'paid'].includes(s))
    return {
      label: 'Pedido aprovado / Pago',
      shortLabel: 'Comprou',
      className: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40',
    };
  if (['pending', 'processing', 'analyzing'].includes(s))
    return {
      label: 'Pedido pendente',
      shortLabel: 'Pendente',
      className: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40',
    };
  if (['refused', 'cancelled', 'canceled', 'refunded', 'expired'].includes(s))
    return {
      label: 'Pedido recusado / cancelado / reembolsado',
      shortLabel: 'Tentativa',
      className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40',
    };
  if (s === 'abandoned')
    return {
      label: 'Carrinho abandonado',
      shortLabel: 'Abandonado',
      className: 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/40',
    };
  if (s === 'chargeback')
    return {
      label: 'Chargeback',
      shortLabel: 'Chargeback',
      className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40',
    };
  const pt = STATUS_LABELS_PT[s];
  if (pt)
    return { ...pt, className: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40' };
  if (s)
    return {
      label: s,
      shortLabel: s.slice(0, 12),
      className: 'bg-muted text-muted-foreground border-border',
    };
  return {
    label: 'Pedido feito',
    shortLabel: 'Pedido',
    className: 'bg-muted text-muted-foreground border-border',
  };
}

/**
 * Situação efetiva para exibição quando só temos metadata do Digital Guru (ex.: lista de conversas).
 * Quando temos abandoned + produtos, consideramos Comprou.
 */
export function effectiveSituationFromDg(
  situation: string | null | undefined,
  hasProducts: boolean
): string | null {
  const s = (situation ?? '').toLowerCase();
  if (['approved', 'paid'].includes(s)) return 'paid';
  if (s === 'abandoned' && hasProducts) return 'paid';
  return situation ?? null;
}
