'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useTotalUnreadCount } from '@/hooks/useTotalUnreadCount';
import { NAV_ITEMS, isNavActive, formatUnreadBadge } from './navItems';

function getInitials(email: string): string {
  const part = email.split('@')[0];
  if (!part) return '?';
  if (part.length >= 2) return part.slice(0, 2).toUpperCase();
  return part[0].toUpperCase();
}

/** Rail de ícones à esquerda — apenas desktop (md+); no mobile usamos a barra inferior. */
export function MobileNavRail() {
  const pathname = usePathname();
  const { user } = useUser();
  const totalUnread = useTotalUnreadCount();

  return (
    <nav
      className="hidden md:flex flex-col items-center w-14 flex-shrink-0 border-r border-white/10 bg-[#0a0a18] py-2"
      aria-label="Menu principal"
    >
      <div className="flex flex-col items-center gap-1 flex-1 min-h-0">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isInbox = href === '/inbox';
          const active = isNavActive(pathname, href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-colors ${
                active
                  ? 'bg-[rgba(139,92,246,0.25)] text-[#a78bfa]'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="relative inline-flex">
                <Icon className="w-6 h-6" strokeWidth={2} />
                {isInbox && totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-[#25D366] text-white">
                    {formatUnreadBadge(totalUnread)}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Avatar do usuário no rodapé do rail */}
      <div className="pt-2 mt-auto border-t border-white/10">
        {user?.email ? (
          <Link
            href="/settings"
            className="flex items-center justify-center w-12 h-12 rounded-xl overflow-hidden ring-2 ring-white/10 hover:ring-[#8b5cf6]/50 transition-all"
            aria-label="Conta e configurações"
          >
            <div
              className="w-full h-full flex items-center justify-center text-white text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              {getInitials(user.email)}
            </div>
          </Link>
        ) : (
          <div className="w-12 h-12 rounded-xl bg-white/10 animate-pulse" />
        )}
      </div>
    </nav>
  );
}
