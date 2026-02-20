'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useSendMessage } from '@/hooks/useSendMessage';
import { Send, Smile, Paperclip, Mic, Video, Loader2 } from 'lucide-react';

const EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '😉', '😍', '🥰', '😘', '😋', '😜', '🤔', '🤗', '👍', '👎',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💖',
  '👋', '🙌', '👏', '🤝', '🙏', '✅', '❌', '⭐', '🔥', '💯',
];

interface MessageInputProps {
  conversationId: string;
}

type SpellMenu = {
  x: number;
  y: number;
  suggestions: string[];
  offset: number;
  length: number;
};

export function MessageInput({ conversationId }: MessageInputProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [spellMenu, setSpellMenu] = useState<SpellMenu | null>(null);
  const [spellLoading, setSpellLoading] = useState(false);
  const [spellLoadingAt, setSpellLoadingAt] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const spellMenuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { sendMessage, uploadAndSendMedia, sending, uploading } = useSendMessage();
  const busy = sending || uploading;

  const closeSpellMenu = useCallback(() => setSpellMenu(null), []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setError(null);
    try {
      await sendMessage(conversationId, text);
      setText('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError(err instanceof Error ? err.message : 'Falha ao enviar mensagem.');
    }
  };

  const insertEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
    if (error) setError(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError(null);
    try {
      await uploadAndSendMedia(conversationId, file, text);
      setText('');
    } catch (err) {
      console.error('Error uploading:', err);
      setError(err instanceof Error ? err.message : 'Falha ao enviar mídia.');
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

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="border-t p-4">
      {error && (
        <p className="mb-2 text-sm text-red-600 whitespace-pre-line" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2 items-end">
        <div className="flex flex-col flex-1 min-w-0 relative">
          <div className="flex gap-1 items-center border rounded-lg bg-background">
            <div className="relative flex-shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setEmojiOpen((o) => !o);
                }}
                className="p-2 text-muted-foreground hover:text-foreground"
                title="Emojis"
                aria-label="Abrir emojis"
                aria-expanded={emojiOpen}
              >
                <Smile className="w-5 h-5" />
              </button>
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={handleFile}
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-muted-foreground hover:text-foreground"
              title="Anexar arquivo ou imagem"
              aria-label="Anexar"
              disabled={busy}
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="p-2 text-muted-foreground hover:text-foreground"
              title="Enviar áudio"
              aria-label="Áudio"
              disabled={busy}
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="p-2 text-muted-foreground hover:text-foreground"
              title="Enviar vídeo"
              aria-label="Vídeo"
              disabled={busy}
            >
              <Video className="w-5 h-5" />
            </button>
            <div lang="pt-BR" className="flex-1 min-w-0 flex">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                onContextMenu={handleContextMenu}
                onBlur={() => setTimeout(() => setEmojiOpen(false), 150)}
                placeholder="Digite uma mensagem..."
                className="flex-1 min-h-[40px] max-h-32 py-2 px-2 border-0 bg-transparent resize-none focus:outline-none focus:ring-0"
                disabled={busy}
                rows={1}
                spellCheck
                lang="pt-BR"
                aria-label="Mensagem"
              />
            </div>
          </div>
        </div>
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="p-2.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
