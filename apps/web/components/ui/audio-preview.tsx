'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Compact audio player used by SceneClipCard to preview the generated
// voice MP3. HTML5 `<audio>` under the hood; we just style + render
// duration + a play/pause toggle. Pauses other instances when one starts
// playing (single-track UX) via a window-level event.
const AUDIO_PLAY_EVENT = 'audio-preview:play';

export function AudioPreview({
  src,
  durationSeconds,
  className,
}: {
  src: string;
  durationSeconds?: number | null;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };
    const onTime = () => {
      if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTime);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTime);
    };
  }, []);

  // When any other audio-preview starts, pause this one.
  useEffect(() => {
    const onSomeoneElsePlay = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail !== src && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    };
    window.addEventListener(AUDIO_PLAY_EVENT, onSomeoneElsePlay);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, onSomeoneElsePlay);
  }, [src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: src }));
      void audio.play();
    } else {
      audio.pause();
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2.5',
        className,
      )}
      dir="ltr"
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
          isPlaying
            ? 'bg-primary text-primary-foreground'
            : 'bg-foreground/10 hover:bg-foreground/20 text-foreground',
        )}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <span className="text-xs">⏸</span> : <span className="ms-0.5 text-sm">▶</span>}
      </button>

      <div className="flex-1 min-w-0">
        <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatSeconds(durationSeconds ?? 0)}
      </span>

      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}

function formatSeconds(s: number): string {
  if (!s || !Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
