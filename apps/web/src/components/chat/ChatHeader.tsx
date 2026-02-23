'use client';

import { useEffect, useState, useRef } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { ChannelBadge } from '../layout/ChannelBadge';
import type { Conversation, Contact, Channel } from '@/types';
import { User, Phone, Mail, FileText, X, MessageCircle, Calendar } from 'lucide-react';

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

interface ChatHeaderProps {
  conversationId: string;
}

export function ChatHeader({ conversationId }: ChatHeaderProps) {
  const supabase = useSupabase();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [showContactInfo, setShowContactInfo] = useState(false);
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

  if (!conversation) {
    return <div className="h-16 border-b" />;
  }

  const contact = conversation.contact as Contact | undefined;
  const channel = conversation.channel as Channel | undefined;
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
            {!contact.name && !contact.phone && !contact.email && !contact.notes && (
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
