'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTotalUnreadCount } from '@/hooks/useTotalUnreadCount';
import { NAV_ITEMS, isNavActive, formatUnreadBadge } from './navItems';

/**
 * Barra de navegação inferior — apenas mobile (md:hidden), estilo WhatsApp.
 * Fica escondida quando uma conversa está aberta (a tela do chat ocupa tudo).
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const totalUnread = useTotalUnreadCount();

  return (
    <nav
      className="md:hidden flex items-stretch justify-around shrink-0 border-t border-white/10 bg-[#0a0a18] pb-[env(safe-area-inset-bottom)]"
      aria-label="Menu principal"
    >
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const isInbox = href === '/inbox';
        const active = isNavActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-2 transition-colors ${
              active ? 'text-[#a78bfa]' : 'text-gray-400 hover:text-white'
            }`}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
          >
            <span className="relative inline-flex">
              <Icon className="w-6 h-6" strokeWidth={2} />
              {isInbox && totalUnread > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-[#25D366] text-white">
                  {formatUnreadBadge(totalUnread)}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium leading-none truncate max-w-full">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
