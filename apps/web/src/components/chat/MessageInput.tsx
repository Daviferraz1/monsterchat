'use client';

import { useState } from 'react';
import { useSendMessage } from '@/hooks/useSendMessage';
import { Send } from 'lucide-react';

interface MessageInputProps {
  conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { sendMessage, sending } = useSendMessage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setError(null);

    try {
      await sendMessage(conversationId, text);
      setText('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      {error && (
        <p className="mb-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Digite uma mensagem..."
          className="flex-1 px-4 py-2 border rounded-lg bg-background"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </form>
  );
}
