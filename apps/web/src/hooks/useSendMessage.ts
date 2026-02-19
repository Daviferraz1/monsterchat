import { useState } from 'react';

export type MediaContentType = 'image' | 'video' | 'audio' | 'document';

export interface SendMessageOptions {
  senderId?: string;
  mediaUrl?: string;
  contentType?: MediaContentType;
  caption?: string;
  filename?: string;
}

export function useSendMessage() {
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const sendMessage = async (
    conversationId: string,
    text: string,
    options?: SendMessageOptions
  ) => {
    setSending(true);
    try {
      const body: Record<string, unknown> = {
        conversation_id: conversationId,
        text: text || undefined,
        sender_id: options?.senderId,
        caption: options?.caption || undefined,
        filename: options?.filename,
      };
      if (options?.mediaUrl && options?.contentType) {
        body.media_url = options.mediaUrl;
        body.content_type = options.contentType;
      }

      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const uploadAndSendMedia = async (
    conversationId: string,
    file: File,
    caption: string,
    senderId?: string
  ) => {
    const mapType = (): MediaContentType => {
      const t = file.type.toLowerCase();
      if (t.startsWith('image/')) return 'image';
      if (t.startsWith('video/')) return 'video';
      if (t.startsWith('audio/')) return 'audio';
      return 'document';
    };

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('conversation_id', conversationId);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: form,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'Falha no upload.'
        );
      }

      const url = data.url as string;
      if (!url) throw new Error('URL não retornada pelo upload.');

      await sendMessage(conversationId, caption, {
        senderId,
        mediaUrl: url,
        contentType: mapType(),
        caption: caption || undefined,
        filename: file.name,
      });
    } finally {
      setUploading(false);
    }
  };

  return { sendMessage, uploadAndSendMedia, sending, uploading };
}
