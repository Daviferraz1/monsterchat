'use client';

import { useEffect, useState, useRef } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { ChannelBadge } from '../layout/ChannelBadge';
import type { Conversation, Contact, Channel } from '@/types';
import { User, Phone, Mail, FileText, X, MessageCircle, Calendar, GraduationCap, Package, Info, Receipt } from 'lucide-react';
import type { DigitalGuruMetadata } from '@/types';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function orderStatusBadge(status: string | null | undefined): { label: string; className: string; shortLabel: string } {
  const s = (status ?? '').toLowerCase();
  if (['approved', 'paid'].includes(s)) return { label: 'Pedido aprovado / Pago', shortLabel: 'Comprou', className: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/40' };
  if (['pending', 'processing', 'analyzing'].includes(s)) return { label: 'Pedido pendente', shortLabel: 'Pendente', className: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/40' };
  if (['refused', 'cancelled', 'canceled', 'refunded', 'expired'].includes(s)) return { label: 'Pedido recusado / cancelado', shortLabel: 'Tentativa', className: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/40' };
  if (s) return { label: s, shortLabel: s.slice(0, 12), className: 'bg-muted text-muted-foreground border-border' };
  return { label: 'Pedido feito', shortLabel: 'Pedido', className: 'bg-muted text-muted-foreground border-border' };
}

interface ChatHeaderProps {
  conversationId: string;
}

export function ChatHeader({ conversationId }: ChatHeaderProps) {
  const supabase = useSupabase();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [contactSales, setContactSales] = useState<Array<{ id: string; product_names: string; status: string | null; sold_at: string; payment_method?: string | null; payment_total?: number | null }>>([]);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadConversation = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          *,
          contact:contacts(*),
          channel:channels(*)
        `)
        .eq('id', conversationId)
        .single();

      if (error) {
        console.error('Error loading conversation:', error);
        return;
      }

      setConversation(data);
    };

    loadConversation();
  }, [conversationId, supabase]);

  useEffect(() => {
    if (!showContactInfo) return;
    const onDocClick = (e: MouseEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return;
      setShowContactInfo(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [showContactInfo]);

  const contactId = (conversation?.contact as Contact | undefined)?.id;
  useEffect(() => {
    if (!showContactInfo || !contactId) {
      setContactSales([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/integrations/digital-guru/sales?contact_id=${encodeURIComponent(contactId)}&limit=20`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.sales)) setContactSales(data.sales);
      } catch {
        if (!cancelled) setContactSales([]);
      }
    })();
    return () => { cancelled = true; };
  }, [showContactInfo, contactId]);

  if (!conversation) {
    return <div className="h-16 border-b" />;
  }

  const contact = conversation.contact as Contact | undefined;
  const channel = conversation.channel as Channel | undefined;
  const dg = contact?.metadata?.digital_guru as DigitalGuruMetadata | undefined;
  const instagramUsername = channel?.type === 'instagram' && contact?.metadata?.username;
  const displayName =
    contact?.name ||
    contact?.phone ||
    (instagramUsername ? `@${contact.metadata.username}` : null) ||
    'Contato sem nome';
  const initials = displayName && displayName !== 'Contato sem nome'
    ? displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <div ref={headerRef} className="relative">
      <button
        type="button"
        onClick={() => setShowContactInfo((v) => !v)}
        className="h-16 border-b flex items-center gap-3 px-4 w-full text-left hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {contact?.profile_pic_url ? (
          <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contact.profile_pic_url} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold text-white bg-primary/80">
            {initials}
          </div>
        )}
        {channel && <ChannelBadge type={channel.type} />}
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{displayName}</h2>
          <p className="text-sm text-muted-foreground truncate">
            {contact?.phone || contact?.external_id || '—'}
          </p>
          {dg && (
            <span
              className={`inline-flex items-center mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${orderStatusBadge(dg.situation).className}`}
              title={orderStatusBadge(dg.situation).label}
            >
              Pedido feito · {orderStatusBadge(dg.situation).shortLabel}
            </span>
          )}
        </div>
      </button>

      {showContactInfo && contact && (
        <div
          className="absolute right-0 top-full z-[200] mt-0 w-[min(320px,100%)] bg-popover border rounded-b-lg rounded-tl-lg shadow-lg p-4"
          role="dialog"
          aria-label="Informações do contato"
        >
          <div className="flex items-start justify-between gap-2 mb-3">
            <h3 className="font-semibold text-sm text-muted-foreground">
              Informações do contato
            </h3>
            <button
              type="button"
              onClick={() => setShowContactInfo(false)}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>Início da conversa: {formatDateTime(conversation.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Última mensagem: {formatDateTime(conversation.last_message_at)}</span>
            </div>
            <div className="border-t pt-3 space-y-2">
              {contact.name && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>{contact.name}</span>
                </div>
              )}
              {(contact.phone || contact.external_id) && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>{contact.phone || contact.external_id}</span>
                </div>
              )}
              {contact.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-primary hover:underline truncate block"
                  >
                    {contact.email}
                  </a>
                </div>
              )}
              {contact.notes && (
                <div className="flex items-start gap-2 text-sm">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-muted-foreground whitespace-pre-wrap break-words text-xs">
                    {contact.notes}
                  </p>
                </div>
              )}
            </div>
            {channel && (
              <div className="pt-2 border-t text-xs text-muted-foreground">
                Canal: {channel.name} ({channel.type})
              </div>
            )}
            {dg && (
              <div className="pt-3 border-t space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5" />
                  Digital Guru
                </h4>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Situação:</span>
                    <span
                      className={`inline-flex items-center text-xs font-medium px-2 py-1 rounded border ${orderStatusBadge(dg.situation).className}`}
                      title={orderStatusBadge(dg.situation).label}
                    >
                      Pedido feito · {orderStatusBadge(dg.situation).shortLabel}
                    </span>
                  </div>
                  {dg.situation && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="text-xs">Status do pedido: {dg.situation}</span>
                    </div>
                  )}
                  {dg.products && dg.products.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" />
                        Produtos comprados
                      </span>
                      <ul className="list-disc list-inside text-xs space-y-0.5">
                        {dg.products.map((p, i) => (
                          <li key={i}>
                            {p.name}
                            {p.purchased_at && (
                              <span className="text-muted-foreground ml-1">
                                ({formatDateTime(p.purchased_at)})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {dg.last_sync_at && (
                    <p className="text-[10px] text-muted-foreground pt-1">
                      Última atualização: {formatDateTime(dg.last_sync_at)}
                    </p>
                  )}
                </div>
              </div>
            )}
            {contactSales.length > 0 && (
              <div className="pt-3 border-t space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" />
                  Histórico de transações
                </h4>
                <ul className="space-y-2 text-xs">
                  {contactSales.map((s) => {
                    const badge = orderStatusBadge(s.status);
                    return (
                      <li key={s.id} className="flex flex-col gap-1.5 pl-1 border-l-2 border-muted pl-2">
                        <span className="font-medium truncate" title={s.product_names}>{s.product_names}</span>
                        <span className={`inline-flex items-center w-fit text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.className}`} title={badge.label}>
                          {badge.shortLabel}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDateTime(s.sold_at)}
                          {s.payment_total != null && (
                            <span className="ml-1">
                              · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(s.payment_total))}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {!contact.name && !contact.phone && !contact.email && !contact.notes && !dg && contactSales.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma informação adicional.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
