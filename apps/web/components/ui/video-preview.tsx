'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Compact 9:16 video player used by SceneClipCard.
// Behavior: muted thumbnail at rest, play-on-click with sound, pauses other
// VideoPreviews when one starts (single-track UX, similar to AudioPreview).
//
// Why no <video controls>: stock browser controls don't match the dark/light
// design system and feel out of place on each scene tile. We render a play
// overlay instead and re-show it after the video ends.

import { useEffect } from 'react';

const VIDEO_PLAY_EVENT = 'video-preview:play';

export function VideoPreview({
  src,
  poster,
  durationSeconds,
  className,
}: {
  src: string;
  poster?: string;
  durationSeconds?: number | null;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
    };
  }, []);

  useEffect(() => {
    const onSomeoneElsePlay = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail !== src && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    };
    window.addEventListener(VIDEO_PLAY_EVENT, onSomeoneElsePlay);
    return () => window.removeEventListener(VIDEO_PLAY_EVENT, onSomeoneElsePlay);
  }, [src]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.muted = false;
      window.dispatchEvent(new CustomEvent(VIDEO_PLAY_EVENT, { detail: src }));
      void v.play();
    } else {
      v.pause();
    }
  };

  return (
    <div
      className={cn(
        'relative aspect-[9/16] rounded-md overflow-hidden bg-black border border-border group',
        className,
      )}
      dir="ltr"
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />
      {!isPlaying && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
        >
          <span className="w-14 h-14 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
            <span className="ms-1 text-2xl text-black">▶</span>
          </span>
        </button>
      )}
      {durationSeconds && (
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/60 text-white tabular-nums">
          {formatSeconds(durationSeconds)}
        </div>
      )}
    </div>
  );
}

function formatSeconds(s: number): string {
  if (!s || !Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
