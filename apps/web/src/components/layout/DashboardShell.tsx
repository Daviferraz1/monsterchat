'use client';

import { usePathname } from 'next/navigation';
import { MobileNavRail } from './MobileNavRail';
import { MobileInboxContent } from './MobileInboxContent';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isInboxList = pathname === '/inbox';
  const isInboxSection = pathname?.startsWith('/inbox') ?? false;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Rail de ícones à esquerda (mobile + desktop, estilo WhatsApp Web) */}
      <MobileNavRail />

      {/* Desktop: coluna do meio com lista de conversas quando está na área Inbox */}
      {isInboxSection && (
        <div className="hidden md:flex flex-col w-80 min-w-[320px] flex-shrink-0 border-r border-white/10 h-full overflow-hidden">
          <MobileInboxContent />
        </div>
      )}

      {/* Área principal */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile em /inbox: lista ocupa a área principal */}
        {isInboxList && (
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden md:hidden">
            <MobileInboxContent />
          </main>
        )}
        {/* Conteúdo da rota: chat, estado vazio ou outras páginas */}
        <main
          className={`flex-1 flex flex-col min-h-0 overflow-y-auto overflow-x-hidden ${isInboxList ? 'hidden md:flex' : ''}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
