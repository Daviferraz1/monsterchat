'use client';

import { formatDate } from '@/lib/utils';
import { MediaMessage } from './MediaMessage';
import type { Message } from '@/types';
import { cn } from '@/lib/utils';

const RETURN_TO_BOT_BODY = '[Conversa devolvida para a IA]';

/** Renderiza formatação do WhatsApp: *negrito*, _itálico_, ~tachado~, `mono`. */
function renderWhatsApp(text: string) {
  const tokens = text.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g);
  return tokens.map((t, i) => {
    if (!t) return null;
    const first = t[0];
    if (t.length >= 3 && first === t[t.length - 1] && '*_~`'.includes(first)) {
      const inner = t.slice(1, -1);
      if (first === '*') return <strong key={i}>{inner}</strong>;
      if (first === '_') return <em key={i}>{inner}</em>;
      if (first === '~') return <s key={i}>{inner}</s>;
      return <code key={i} className="px-1 rounded bg-black/10 text-[0.95em]">{inner}</code>;
    }
    return <span key={i}>{t}</span>;
  });
}

interface MessageBubbleProps {
  message: Message;
  /** Foto do contato — exibida no voice note recebido (estilo WhatsApp). */
  contactAvatarUrl?: string | null;
  /** Nome do contato — iniciais no voice note quando não há foto (WhatsApp). */
  contactName?: string | null;
}

export function MessageBubble({ message, contactAvatarUrl, contactName }: MessageBubbleProps) {
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
          isOutbound && isFromIA && 'ring-1 ring-purple-400/50',
          message.content_type === 'reaction' && 'px-3 py-1.5'
        )}
      >
        {message.content_type === 'reaction' && (
          <span className="text-2xl leading-none" title="Reação">
            {message.body?.trim() || '❤️'}
          </span>
        )}
        {message.content_type === 'text' && (
          <p className="whitespace-pre-wrap">
            {message.direction === 'outbound' && !message.body?.trim()
              ? '\u00A0'
              : message.body?.trim()
                ? renderWhatsApp(message.body.trim())
                : '(mensagem vazia)'}
          </p>
        )}
        {message.media_url && (
          <MediaMessage
            url={message.media_url}
            mimeType={message.media_mime_type}
            filename={message.media_filename}
            contentType={message.content_type}
            direction={message.direction}
            avatarUrl={isOutbound ? undefined : contactAvatarUrl}
            avatarName={isOutbound ? undefined : contactName}
          />
        )}
        {!message.media_url && message.content_type !== 'text' && message.content_type !== 'reaction' && (
          <p className="text-sm opacity-80">{message.body?.trim() || `[${message.content_type}]`}</p>
        )}
        {message.content_type !== 'reaction' && (
        <span className="text-xs opacity-70 mt-1 block flex items-center gap-1.5">
          {isOutbound && isFromIA && <span className="text-[10px] opacity-90">🤖 IA</span>}
          {formatDate(message.created_at)}
        </span>
        )}
      </div>
    </div>
  );
}
