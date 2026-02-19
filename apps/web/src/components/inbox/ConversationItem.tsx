'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { ChannelBadge } from '../layout/ChannelBadge';
import type { Conversation } from '@/types';

interface ConversationItemProps {
  conversation: Conversation;
}

export function ConversationItem({ conversation }: ConversationItemProps) {
  const contact = conversation.contact;
  const channel = conversation.channel;
  const displayName = contact?.name || contact?.phone || 'Contato sem nome';
  const hasUnread = conversation.unread_count > 0;

  return (
    <Link
      href={`/inbox/${conversation.id}`}
      className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors"
    >
      {channel && (
        <ChannelBadge type={channel.type} className="mt-1 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium truncate">{displayName}</p>
          {conversation.last_message_at && (
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatDate(conversation.last_message_at)}
            </span>
          )}
        </div>
        <p
          className={`text-sm truncate ${
            hasUnread ? 'font-medium' : 'text-muted-foreground'
          }`}
        >
          {conversation.last_message_preview || 'Sem mensagens'}
        </p>
        {hasUnread && (
          <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
            {conversation.unread_count}
          </span>
        )}
      </div>
    </Link>
  );
}
