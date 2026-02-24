'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { formatLastMessageTime } from '@/lib/utils';
import { ChannelBadge } from '../layout/ChannelBadge';
import type { Conversation } from '@/types';

const AVATAR_COLORS = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
];

function getInitials(name: string): string {
  if (!name || name === 'Contato sem nome') return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface ConversationItemProps {
  conversation: Conversation;
  /** No mobile, chamado ao tocar na conversa para fechar o drawer */
  onSelect?: () => void;
}

export function ConversationItem({ conversation, onSelect }: ConversationItemProps) {
  const pathname = usePathname();
  const contact = conversation.contact;
  const channel = conversation.channel;
  const instagramUsername = channel?.type === 'instagram' && contact?.metadata?.username;
  const displayName =
    contact?.name ||
    contact?.phone ||
    (instagramUsername ? `@${contact.metadata.username}` : null) ||
    'Contato sem nome';
  const hasUnread = conversation.unread_count > 0;
  const isActive = pathname === `/inbox/${conversation.id}`;
  const colorIndex = (displayName?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length;
  const [avatarError, setAvatarError] = useState(false);
  const showProfilePic = contact?.profile_pic_url && !avatarError;

  return (
    <Link
      href={`/inbox/${conversation.id}`}
      onClick={onSelect}
      className="flex items-start gap-3 p-3 min-h-[72px] transition-all border-b border-white/[0.03] text-left hover:bg-white/[0.04] active:bg-white/[0.06]"
      style={{
        background: isActive ? 'rgba(139,92,246,0.1)' : 'transparent',
        borderLeft: isActive ? '3px solid #8b5cf6' : '3px solid transparent',
      }}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        {showProfilePic ? (
          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={contact.profile_pic_url!}
              alt=""
              className="w-full h-full object-cover"
              onError={() => setAvatarError(true)}
            />
          </div>
        ) : (
          <div
            className="flex items-center justify-center rounded-full w-10 h-10 text-white text-sm font-semibold"
            style={{ background: AVATAR_COLORS[colorIndex] }}
          >
            {getInitials(displayName)}
          </div>
        )}
        {channel && (
          <div className="absolute -bottom-0.5 -right-0.5 bg-[#0d0d1a] rounded-full p-0.5 ring-1 ring-white/10">
            <ChannelBadge type={channel.type} className="w-5 h-5 [&>svg]:w-3 [&>svg]:h-3" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-white truncate">{displayName}</p>
          {conversation.last_message_at && (
            <span className="text-[10px] text-gray-500 flex-shrink-0">
              {formatLastMessageTime(conversation.last_message_at)}
            </span>
          )}
        </div>
        <p
          className={`text-xs truncate ${hasUnread ? 'font-medium text-gray-300' : 'text-gray-500'}`}
        >
          {conversation.last_message_preview?.trim() ||
            (conversation.last_message_at ? 'Mensagem' : 'Sem mensagens')}
        </p>
        {hasUnread && (
          <span
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold rounded-full text-white flex-shrink-0"
            style={{ background: '#8b5cf6' }}
          >
            {conversation.unread_count}
          </span>
        )}
      </div>
    </Link>
  );
}
