'use client';

import { formatDate } from '@/lib/utils';
import { MediaMessage } from './MediaMessage';
import type { Message } from '@/types';
import { cn } from '@/lib/utils';

const RETURN_TO_BOT_BODY = '[Conversa devolvida para a IA]';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const isFromIA = message.sender_type === 'system' || message.sender_type === 'bot';
  const isInternalOnly =
    isOutbound && isFromIA && message.content_type === 'text' && message.body?.trim() === RETURN_TO_BOT_BODY;

  // Mensagem interna: não foi enviada ao aluno, só registra no sistema que a conversa foi devolvida à IA
  if (isInternalOnly) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-full border border-dashed">
          ↩ Conversa devolvida para a IA (só interno — o aluno não vê isso)
        </span>
      </div>
    );
  }

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
            : 'bg-muted text-foreground',
          isOutbound && isFromIA && 'ring-1 ring-purple-400/50'
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
        <span className="text-xs opacity-70 mt-1 block flex items-center gap-1.5">
          {isOutbound && isFromIA && <span className="text-[10px] opacity-90">🤖 IA</span>}
          {formatDate(message.created_at)}
        </span>
      </div>
    </div>
  );
}
