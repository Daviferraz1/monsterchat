'use client';

import { formatDate } from '@/lib/utils';
import { MediaMessage } from './MediaMessage';
import type { Message } from '@/types';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isContact = message.sender_type === 'contact';

  return (
    <div
      className={cn(
        'flex gap-2',
        isOutbound ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[70%] rounded-lg px-4 py-2',
          isOutbound
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {message.content_type === 'text' && (
          <p className="whitespace-pre-wrap">
            {message.direction === 'outbound' && !message.body?.trim()
              ? '\u00A0'
              : message.body?.trim() || '(mensagem vazia)'}
          </p>
        )}
        {message.media_url && (
          <MediaMessage
            url={message.media_url}
            mimeType={message.media_mime_type}
            filename={message.media_filename}
            contentType={message.content_type}
          />
        )}
        {!message.media_url && message.content_type !== 'text' && message.content_type !== 'reaction' && (
          <p className="text-sm opacity-80">{message.body?.trim() || `[${message.content_type}]`}</p>
        )}
        <span className="text-xs opacity-70 mt-1 block">
          {formatDate(message.created_at)}
        </span>
      </div>
    </div>
  );
}
