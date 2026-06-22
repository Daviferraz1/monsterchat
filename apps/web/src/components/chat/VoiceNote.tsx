'use client';

import { useRef, useState } from 'react';
import { Play, Pause, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Alturas determinísticas das barras (a partir de uma seed estável) — simula a onda sonora do WhatsApp. */
function buildBars(seed: string, n = 34): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    out.push(0.25 + ((h % 1000) / 1000) * 0.75); // 0.25..1.0
  }
  return out;
}

interface VoiceNoteProps {
  url: string;
  outbound?: boolean;
  avatarUrl?: string | null;
}

export function VoiceNote({ url, outbound, avatarUrl }: VoiceNoteProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const detectingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bars] = useState(() => buildBars(url));

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const seekTo = (clientX: number, el: HTMLElement) => {
    const a = audioRef.current;
    if (!a || !isFinite(a.duration)) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = frac * a.duration;
  };

  const handleLoaded = () => {
    const a = audioRef.current;
    if (!a) return;
    // Áudios ogg/opus às vezes vêm com duration Infinity até "forçar" o cálculo (hack conhecido do Chrome).
    if (a.duration === Infinity || isNaN(a.duration)) {
      detectingRef.current = true;
      const onUpd = () => {
        a.removeEventListener('timeupdate', onUpd);
        const dur = isFinite(a.duration) ? a.duration : 0;
        a.currentTime = 0;
        setDuration(dur);
        setCurrent(0);
        detectingRef.current = false;
      };
      a.addEventListener('timeupdate', onUpd);
      a.currentTime = 1e101;
    } else {
      setDuration(a.duration);
    }
  };

  const progress = duration > 0 ? current / duration : 0;
  const playedCount = Math.round(progress * bars.length);

  const playedColor = outbound ? 'bg-white' : 'bg-[#8b5cf6]';
  const unplayedColor = outbound ? 'bg-white/40' : 'bg-foreground/25';
  const timeColor = outbound ? 'text-primary-foreground/70' : 'text-muted-foreground';

  const avatar = (
    <div className="relative shrink-0 w-11 h-11">
      <div className="w-11 h-11 rounded-full overflow-hidden bg-muted flex items-center justify-center">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL externa (Supabase/Meta)
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <Mic className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <span className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-[#25D366] flex items-center justify-center ring-2 ring-[color:var(--bubble-ring,transparent)]">
        <Mic className="w-2.5 h-2.5 text-white" />
      </span>
    </div>
  );

  return (
    <div className="flex items-center gap-2 w-[250px] max-w-full">
      {!outbound && avatar}

      <button
        type="button"
        onClick={toggle}
        className={cn('shrink-0', outbound ? 'text-primary-foreground' : 'text-foreground')}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
      >
        {playing ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
      </button>

      <div className="flex-1 min-w-0">
        <div
          className="flex items-center gap-[2px] h-7 cursor-pointer"
          onClick={(e) => seekTo(e.clientX, e.currentTarget)}
        >
          {bars.map((hgt, i) => (
            <span
              key={i}
              className={cn('flex-1 rounded-full transition-colors', i < playedCount ? playedColor : unplayedColor)}
              style={{ height: `${Math.round(hgt * 100)}%` }}
            />
          ))}
        </div>
        <div className={cn('text-[11px] mt-0.5', timeColor)}>
          {fmt(playing || current > 0 ? current : duration)}
        </div>
      </div>

      {outbound && avatar}

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          if (detectingRef.current) return;
          setCurrent(e.currentTarget.currentTime);
        }}
        onLoadedMetadata={handleLoaded}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
    </div>
  );
}
