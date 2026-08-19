import { MessageSquare, Users, ShoppingBag, CreditCard, Settings, KanbanSquare, BarChart3, type LucideIcon } from 'lucide-react';

export type NavItem = { href: string; icon: LucideIcon; label: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/painel', icon: BarChart3, label: 'Painel' },
  { href: '/quadro', icon: KanbanSquare, label: 'Tarefas' },
  { href: '/inbox', icon: MessageSquare, label: 'Conversas' },
  { href: '/contacts', icon: Users, label: 'Contatos' },
  { href: '/sales', icon: ShoppingBag, label: 'Vendas' },
  { href: '/subscriptions', icon: CreditCard, label: 'Assinaturas' },
  { href: '/settings', icon: Settings, label: 'Config.' },
];

/** Marca o item ativo conforme a rota atual. */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/inbox') return pathname.startsWith('/inbox');
  if (href === '/settings') return pathname.startsWith('/settings');
  if (href === '/quadro') return pathname.startsWith('/quadro');
  if (href === '/painel') return pathname.startsWith('/painel');
  return pathname.startsWith(href);
}

/** Número para o badge de não lidas: real até 999, depois "999+". */
export function formatUnreadBadge(n: number): string {
  if (n <= 0) return '';
  return n > 999 ? '999+' : String(n);
}
