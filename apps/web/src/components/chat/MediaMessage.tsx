'use client';

interface MediaMessageProps {
  url: string;
  mimeType?: string;
  filename?: string;
  contentType?: string;
}

/** URL temporária da Meta (WhatsApp) — exige token, retorna 401 no navegador. Não dá para tocar/baixar. */
function isTemporaryMetaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('lookaside.fbsbx.com') || u.hostname.includes('facebook.com');
  } catch {
    return false;
  }
}

function isImage(mime?: string, contentType?: string): boolean {
  if (mime?.startsWith('image/')) return true;
  if (contentType === 'image' || contentType === 'sticker') return true;
  return false;
}

function isVideo(mime?: string, contentType?: string): boolean {
  if (mime?.startsWith('video/')) return true;
  return contentType === 'video';
}

function isAudio(mime?: string, contentType?: string): boolean {
  if (mime?.startsWith('audio/')) return true;
  return contentType === 'audio';
}

export function MediaMessage({ url, mimeType, filename, contentType }: MediaMessageProps) {
  const isUnavailable = isTemporaryMetaUrl(url);

  if (isUnavailable) {
    return (
      <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
        Este áudio/imagem não está mais disponível para reprodução ou download (mensagem recebida antes do armazenamento no servidor). Novas mídias passam a ser salvas e ficam acessíveis.
      </div>
    );
  }

  if (isImage(mimeType, contentType)) {
    return (
      <div className="space-y-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- URL externa (Supabase/Meta), next/image exige domínio configurado */}
          <img
            src={url}
            alt={filename || 'Imagem'}
            className="max-w-full max-h-80 w-auto h-auto object-contain rounded cursor-pointer"
          />
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Abrir imagem em nova aba
        </a>
      </div>
    );
  }

  if (isVideo(mimeType, contentType)) {
    return (
      <div className="space-y-1">
        <video
          src={url}
          controls
          preload="metadata"
          className="w-full max-w-md rounded"
        >
          Seu navegador não suporta vídeo.
        </video>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline block"
        >
          Abrir vídeo em nova aba
        </a>
      </div>
    );
  }

  if (isAudio(mimeType, contentType)) {
    return (
      <div className="space-y-2">
        <audio
          src={url}
          controls
          preload="metadata"
          className="w-full max-w-sm"
        >
          Seu navegador não suporta áudio.
        </audio>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline block"
        >
          Abrir ou baixar áudio
        </a>
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={filename}
      className="block px-4 py-2 bg-muted rounded hover:bg-muted/80"
    >
      📎 {filename || 'Abrir arquivo'}
    </a>
  );
}
