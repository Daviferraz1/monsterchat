'use client';

import { usePathname } from 'next/navigation';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useTotalUnreadCount } from '@/hooks/useTotalUnreadCount';
import { MobileNavRail } from './MobileNavRail';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileInboxContent } from './MobileInboxContent';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  // Contagem buscada uma vez aqui e distribuída: os dois menus mostram o mesmo
  // badge, não faz sentido cada um manter sua própria consulta.
  const totalUnread = useTotalUnreadCount();
  const isInboxList = pathname === '/inbox';
  const isInboxSection = pathname?.startsWith('/inbox') ?? false;
  // Conversa aberta (/inbox/[id]): no mobile o chat ocupa a tela toda e a barra inferior some.
  const isConversationOpen = isInboxSection && !isInboxList;

  // A lista de conversas vive em um lugar só — coluna do meio no desktop, área
  // principal no mobile. As duas nunca aparecem juntas, então também não devem
  // ser montadas juntas: cada montagem carrega a lista inteira do servidor.
  const showInboxColumn = isDesktop && isInboxSection;
  const showInboxMain = !isDesktop && isInboxList;

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Rail de ícones à esquerda (somente desktop, estilo WhatsApp Web) */}
      {isDesktop && <MobileNavRail totalUnread={totalUnread} />}

      {/* Desktop: coluna do meio com a lista de conversas.
          Largura proporcional como no WhatsApp Web (~30%), com piso e teto: em tela
          pequena não espreme a prévia da mensagem, em tela grande não rouba espaço
          do chat. Antes era fixa em 320px, o que virava 17% num monitor de 1920. */}
      {showInboxColumn && (
        <div className="flex flex-col w-[30%] min-w-[340px] max-w-[560px] flex-shrink-0 border-r border-white/10 h-full overflow-hidden">
          <MobileInboxContent />
        </div>
      )}

      {/* Área principal */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile em /inbox: lista ocupa a área principal */}
        {showInboxMain && (
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <MobileInboxContent />
          </main>
        )}
        {/* Conteúdo da rota: chat, estado vazio ou outras páginas.
            Na conversa aberta, o scroll é interno da ChatWindow (mensagens) — o main NÃO rola,
            assim o header e o campo de envio ficam fixos. Nas demais páginas, o main rola. */}
        <main
          className={`flex-1 flex flex-col min-h-0 overflow-x-hidden ${
            isConversationOpen ? 'overflow-y-hidden' : 'overflow-y-auto'
          } ${isInboxList ? 'hidden md:flex' : ''}`}
        >
          {children}
        </main>

        {/* Barra de navegação inferior (mobile): some quando uma conversa está aberta */}
        {!isDesktop && !isConversationOpen && <MobileBottomNav totalUnread={totalUnread} />}
      </div>
    </div>
  );
}
