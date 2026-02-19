import { useState } from 'react';

export function useSendMessage() {
  const [sending, setSending] = useState(false);

  const sendMessage = async (
    conversationId: string,
    text: string,
    senderId?: string
  ) => {
    setSending(true);
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          text,
          sender_id: senderId,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof data?.error === 'string'
            ? data.error
            : 'Falha ao enviar mensagem.';
        throw new Error(message);
      }

      return data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    } finally {
      setSending(false);
    }
  };

  return { sendMessage, sending };
}
