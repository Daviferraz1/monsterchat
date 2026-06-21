'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useSuggestion } from '@/hooks/useSuggestion';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { Send, Smile, Paperclip, Mic, Video, Camera, Loader2, MessageCircle, Check, Plus, X, FileText, Square } from 'lucide-react';

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '😉', '😍', '🥰', '😘', '😋', '😜', '🤔', '🤗', '👍', '👎',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💖',
  '👋', '🙌', '👏', '🤝', '🙏', '✅', '❌', '⭐', '🔥', '💯',
];

const TEXTAREA_MIN_HEIGHT = 40;
const TEXTAREA_MAX_HEIGHT = 200;

function PendingImagePreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <div className="w-14 h-14 rounded-lg bg-muted animate-pulse" />;
  return (
    <img src={url} alt="" className="w-14 h-14 object-cover rounded-lg" />
  );
}

function PendingAudioPreview({ file }: { file: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="flex items-center gap-2">
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Mic className="w-5 h-5 text-muted-foreground" />
      </div>
      {url && <audio src={url} controls className="h-9 max-w-[220px]" />}
    </div>
  );
}

interface MessageInputProps {
  conversationId: string;
  lastInboundBody?: string | null;
  suggestionEnabled?: boolean;
  /** Quando true, não busca sugestão (última msg é do operador — evita gastar IA). */
  lastMessageFromOperator?: boolean;
}

type SpellMenu = {
  x: number;
  y: number;
  suggestions: string[];
  offset: number;
  length: number;
};

export function MessageInput({
  conversationId,
  lastInboundBody = null,
  suggestionEnabled = false,
  lastMessageFromOperator = false,
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [spellMenu, setSpellMenu] = useState<SpellMenu | null>(null);
  const [spellLoading, setSpellLoading] = useState(false);
  const [spellLoadingAt, setSpellLoadingAt] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageVideoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const spellMenuRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { sendMessage, uploadAndSendMedia, sending, uploading } = useSendMessage();
  const { result: suggestionResult, loading: suggestionLoading, fetchSuggestion, clear: clearSuggestion } = useSuggestion();
  const recorder = useVoiceRecorder();
  const busy = sending || uploading;

  const stopRecordingToPending = async () => {
    const file = await recorder.stop();
    if (file) {
      setPendingFile(file);
      setError(null);
    } else {
      setError('Gravação vazia ou cancelada.');
    }
  };

  const closeSpellMenu = useCallback(() => setSpellMenu(null), []);

  useEffect(() => {
    if (lastMessageFromOperator) {
      clearSuggestion();
      return;
    }
    if (suggestionEnabled && lastInboundBody?.trim()) {
      fetchSuggestion(lastInboundBody.trim(), undefined, conversationId);
    } else {
      clearSuggestion();
    }
  }, [suggestionEnabled, lastInboundBody, conversationId, lastMessageFromOperator, fetchSuggestion, clearSuggestion]);

  // Auto-expand textarea conforme o texto (até TEXTAREA_MAX_HEIGHT)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const h = Math.min(ta.scrollHeight, TEXTAREA_MAX_HEIGHT);
    ta.style.height = `${Math.max(TEXTAREA_MIN_HEIGHT, h)}px`;
    if (h >= TEXTAREA_MAX_HEIGHT) ta.style.overflowY = 'auto';
    else ta.style.overflowY = 'hidden';
  }, [text]);

  useEffect(() => {
    if (!spellMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (spellMenuRef.current?.contains(e.target as Node)) return;
      closeSpellMenu();
    };
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [spellMenu, closeSpellMenu]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (attachMenuRef.current?.contains(e.target as Node)) return;
      setAttachMenuOpen(false);
    };
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [attachMenuOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageSent = text.trim();
    const hasFile = pendingFile != null;
    if ((!messageSent && !hasFile) || busy) return;
    setError(null);
    const hadSuggestion = suggestionResult?.suggestion != null;
    const suggestionSnapshot = hadSuggestion
      ? {
          suggestion: suggestionResult!.suggestion,
          confidence: suggestionResult!.confidence,
        }
      : null;
    try {
      if (pendingFile) {
        await uploadAndSendMedia(conversationId, pendingFile, messageSent);
        setPendingFile(null);
        setText('');
      } else {
        await sendMessage(conversationId, messageSent);
        setText('');
      }
      if (suggestionSnapshot) {
        const wasUsed = messageSent === suggestionSnapshot.suggestion?.trim();
        const confidenceMap = { high: 0.9, medium: 0.5, low: 0.2, none: 0 } as const;
        try {
          await fetch('/api/ia/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId,
              suggestedResponse: suggestionSnapshot.suggestion,
              confidence: confidenceMap[suggestionSnapshot.confidence] ?? 0,
              wasUsed,
              wasEdited: !wasUsed,
              editedResponse: messageSent,
              questionContext: lastInboundBody?.trim() || undefined,
            }),
          });
        } catch {
          // não bloqueia o envio; feedback é best-effort
        }
        clearSuggestion();
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
    }
  };

  const insertEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    if (error) setError(null);
  };

  const isImageOrVideo = (f: File) => {
    const t = f.type.toLowerCase();
    return t.startsWith('image/') || t.startsWith('video/');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    if (isImageOrVideo(file)) {
      setPendingFile(file);
      return;
    }
    try {
      await uploadAndSendMedia(conversationId, file, text);
      setText('');
    } catch (err) {
      console.error('Error uploading:', err);
      setError(err instanceof Error ? err.message : 'Falha ao enviar mídia.');
    }
  };

  const handleImageVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    setPendingFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && isImageOrVideo(file)) {
          e.preventDefault();
          setError(null);
          setPendingFile(file);
          return;
        }
      }
    }
  };

  const handleContextMenu = async (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const ta = textareaRef.current;
    if (!ta || busy) return;
    const offset = ta.selectionStart;
    e.preventDefault();
    setSpellMenu(null);
    setSpellLoadingAt({ x: e.clientX, y: e.clientY });
    setSpellLoading(true);
    try {
      const res = await fetch('/api/spell/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, offset }),
      });
      const data = await res.json().catch(() => ({}));
      const suggestions = data.suggestions ?? [];
      const off = data.offset;
      const len = data.length;
      if (suggestions.length > 0 && typeof off === 'number' && typeof len === 'number') {
        setSpellMenu({
          x: e.clientX,
          y: e.clientY,
          suggestions,
          offset: off,
          length: len,
        });
      }
    } catch {
      // silenciar erro; menu só não abre
    } finally {
      setSpellLoading(false);
      setSpellLoadingAt(null);
    }
  };

  const applySuggestion = (suggestion: string) => {
    if (!spellMenu) return;
    const { offset, length } = spellMenu;
    const newText =
      text.slice(0, offset) + suggestion + text.slice(offset + length);
    setText(newText);
    closeSpellMenu();
    textareaRef.current?.focus();
    setTimeout(() => {
      const pos = offset + suggestion.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const metaDebugUrl = error && /https:\/\/www\.meta\.com\/debug/.test(error)
    ? error.match(/https:\/\/www\.meta\.com\/debug[^\s)]*/)?.[0]
    : null;

  const applyIASuggestion = useCallback(() => {
    if (suggestionResult?.suggestion) {
      setText(suggestionResult.suggestion);
      textareaRef.current?.focus();
      // não limpa a sugestão aqui; o feedback (wasUsed) será enviado no handleSubmit
    }
  }, [suggestionResult?.suggestion]);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="border-t p-3 sm:p-4 shrink-0">
      {suggestionEnabled && (suggestionLoading || suggestionResult?.suggestion) && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-2.5 text-sm">
          <MessageCircle className="w-4 h-4 shrink-0 text-[#7c3aed]" />
          {suggestionLoading ? (
            <span className="flex-1 text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Buscando sugestão na base de conhecimento...
            </span>
          ) : suggestionResult?.suggestion ? (
            <>
              <span className="flex-1 line-clamp-2 text-foreground">
                {suggestionResult.suggestion}
              </span>
              <button
                type="button"
                onClick={applyIASuggestion}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] font-medium text-xs"
              >
                <Check className="w-3.5 h-3.5" />
                Usar
              </button>
            </>
          ) : null}
        </div>
      )}
      {error && (
        <div className="mb-2 text-sm text-red-600" role="alert">
          <p className="whitespace-pre-line">{error}</p>
          {metaDebugUrl && (
            <a
              href={metaDebugUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-red-700 underline hover:text-red-800"
            >
              Abrir detalhes no Meta Debug
            </a>
          )}
        </div>
      )}
      {recorder.error && (
        <div className="mb-2 text-sm text-red-600" role="alert">
          {recorder.error}
        </div>
      )}
      {recorder.recording && (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-2.5">
          <span className="flex items-center gap-2 text-sm font-medium text-red-600">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            Gravando {formatSeconds(recorder.seconds)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={recorder.cancel}
              className="px-3 py-1.5 rounded-lg border text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={stopRecordingToPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              <Square className="w-3.5 h-3.5" />
              Parar
            </button>
          </div>
        </div>
      )}
      {pendingFile && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border bg-muted/50 p-2">
          {pendingFile.type.startsWith('image/') ? (
            <PendingImagePreview file={pendingFile} />
          ) : pendingFile.type.startsWith('audio/') ? (
            <PendingAudioPreview file={pendingFile} />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center">
              <Video className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <span className="flex-1 text-sm text-muted-foreground truncate" title={pendingFile.name}>
            {pendingFile.name}
          </span>
          <button
            type="button"
            onClick={() => setPendingFile(null)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Remover anexo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex flex-col flex-1 min-w-0 relative">
          <div className="flex gap-0.5 sm:gap-1 items-center border rounded-xl bg-background">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={handleFile}
            />
            <input
              ref={imageVideoInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={handleImageVideoSelect}
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              capture="user"
              className="hidden"
              onChange={handleFile}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              capture="environment"
              className="hidden"
              onChange={handleFile}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageVideoSelect}
            />
            <div className="relative flex-shrink-0" ref={attachMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setAttachMenuOpen((o) => !o);
                  setEmojiOpen(false);
                }}
                className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg"
                title="Anexar, emojis, áudio, vídeo"
                aria-label="Expandir opções"
                aria-expanded={attachMenuOpen}
              >
                <Plus className="w-5 h-5" />
              </button>
              {attachMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 flex gap-1 p-2 rounded-xl bg-popover border shadow-xl z-[100]">
                  <button
                    type="button"
                    onClick={() => {
                      setAttachMenuOpen(false);
                      setEmojiOpen(true);
                    }}
                    className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Emojis"
                    aria-label="Emojis"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      imageVideoInputRef.current?.click();
                      setAttachMenuOpen(false);
                    }}
                    className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Anexar imagem ou vídeo (envia ao clicar em Enviar)"
                    aria-label="Anexar imagem ou vídeo"
                    disabled={busy}
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setAttachMenuOpen(false);
                    }}
                    className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Anexar documento (PDF, etc.) — envia na hora"
                    aria-label="Anexar documento"
                    disabled={busy}
                  >
                    <FileText className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      videoInputRef.current?.click();
                      setAttachMenuOpen(false);
                    }}
                    className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    title="Enviar vídeo"
                    aria-label="Vídeo"
                    disabled={busy}
                  >
                    <Video className="w-5 h-5" />
                  </button>
                </div>
              )}
              {emojiOpen && (
                <div
                  className="absolute bottom-full left-0 mb-2 p-3 min-w-[280px] w-max max-w-[min(320px,100vw)] bg-popover border rounded-xl shadow-xl grid grid-cols-10 gap-1 max-h-44 overflow-y-auto z-[100]"
                  role="listbox"
                  style={{ width: 'max-content' }}
                >
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="p-1.5 text-xl hover:bg-muted rounded-md transition-colors"
                      onClick={() => insertEmoji(emoji)}
                      role="option"
                      aria-selected={false}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div lang="pt-BR" className="flex-1 min-w-0 flex items-end">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                onPaste={handlePaste}
                onContextMenu={handleContextMenu}
                onBlur={() => setTimeout(() => setEmojiOpen(false), 150)}
                placeholder={pendingFile ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                className="flex-1 w-full min-h-[40px] py-2.5 px-3 border-0 bg-transparent resize-none focus:outline-none focus:ring-0 placeholder:text-muted-foreground text-foreground leading-normal"
                style={{ height: TEXTAREA_MIN_HEIGHT, maxHeight: TEXTAREA_MAX_HEIGHT }}
                disabled={busy}
                rows={1}
                spellCheck
                lang="pt-BR"
                aria-label="Mensagem"
              />
            </div>
            {!text.trim() && (
              <div className="flex items-center flex-shrink-0 pr-0.5">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg"
                  title="Tirar foto (abre a câmera no celular)"
                  aria-label="Abrir câmera"
                  disabled={busy || recorder.recording}
                >
                  <Camera className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    setEmojiOpen(false);
                    recorder.start();
                  }}
                  className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-lg"
                  title="Gravar áudio"
                  aria-label="Gravar áudio"
                  disabled={busy || recorder.recording}
                >
                  <Mic className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={(!text.trim() && !pendingFile) || busy}
          className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center bg-primary text-primary-foreground rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          aria-label="Enviar"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

      {spellLoading && spellLoadingAt && (
        <div
          className="fixed z-[110] flex items-center gap-1 rounded-lg bg-popover border shadow-lg px-2 py-1.5 text-sm text-muted-foreground"
          style={{
            left: Math.min(spellLoadingAt.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 140),
            top: Math.max(8, spellLoadingAt.y - 36),
          }}
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          Verificando...
        </div>
      )}

      {spellMenu && !spellLoading && (
        <div
          ref={spellMenuRef}
          className="fixed z-[110] min-w-[160px] max-w-[280px] max-h-[70vh] overflow-y-auto rounded-lg bg-popover border shadow-lg py-1"
          style={{
            left: Math.min(spellMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 180),
            top: (() => {
              const menuHeightEstimate = Math.min(320, 29 + spellMenu.suggestions.slice(0, 8).length * 40);
              const y = spellMenu.y;
              const winH = typeof window !== 'undefined' ? window.innerHeight : 600;
              const topAbove = y - menuHeightEstimate - 8;
              if (topAbove >= 8) return topAbove;
              const topBelow = y + 8;
              return topBelow + menuHeightEstimate <= winH - 8 ? topBelow : Math.max(8, winH - menuHeightEstimate - 8);
            })(),
          }}
          role="menu"
        >
          <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
            Corrigir para:
          </p>
          {spellMenu.suggestions.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-none first:mt-0"
              onClick={() => applySuggestion(s)}
              role="menuitem"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
