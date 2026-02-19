'use client';

import Image from 'next/image';

interface MediaMessageProps {
  url: string;
  mimeType?: string;
  filename?: string;
}

export function MediaMessage({ url, mimeType, filename }: MediaMessageProps) {
  if (mimeType?.startsWith('image/')) {
    return (
      <div className="relative w-full max-w-md aspect-video rounded overflow-hidden">
        <Image
          src={url}
          alt={filename || 'Imagem'}
          fill
          className="object-cover"
        />
      </div>
    );
  }

  if (mimeType?.startsWith('video/')) {
    return (
      <video
        src={url}
        controls
        className="w-full max-w-md rounded"
      >
        Seu navegador não suporta vídeo.
      </video>
    );
  }

  if (mimeType?.startsWith('audio/')) {
    return (
      <audio src={url} controls className="w-full">
        Seu navegador não suporta áudio.
      </audio>
    );
  }

  return (
    <a
      href={url}
      download={filename}
      className="block px-4 py-2 bg-muted rounded hover:bg-muted/80"
    >
      📎 {filename || 'Arquivo'}
    </a>
  );
}
