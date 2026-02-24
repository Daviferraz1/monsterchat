'use client';

import { useState, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';

const PAGE_TITLES: Record<string, string> = {
  '/inbox': 'Inbox',
  '/contacts': 'Contatos',
  '/sales': 'Últimas vendas',
  '/settings/channels': 'Canais',
};

function getPageTitle(pathname: string | null): string {
  if (!pathname) return 'MonsterChat';
  if (pathname.startsWith('/inbox/')) return 'Conversa';
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path)) return title;
  }
  return 'MonsterChat';
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Ao voltar para /inbox (seta no mobile), abrir o drawer para mostrar a lista de conversas
  useEffect(() => {
    if (pathname === '/inbox') setSidebarOpen(true);
  }, [pathname]);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Sidebar: drawer no mobile, fixo no desktop */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        className="md:relative md:translate-x-0 md:shadow-none"
      />

      {/* Overlay mobile: fecha o drawer ao clicar */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Área principal + barra mobile */}
      <div className="flex flex-1 flex-col min-w-0 h-full">
        {/* Barra superior apenas no mobile */}
        <header className="flex md:hidden items-center gap-3 h-14 shrink-0 px-4 border-b border-white/10 bg-[#0a0a18] text-white z-30">
          <button
            type="button"
            onClick={openSidebar}
            className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold truncate flex-1">
            {getPageTitle(pathname)}
          </h1>
        </header>

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
