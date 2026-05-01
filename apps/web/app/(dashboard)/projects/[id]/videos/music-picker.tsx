'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { MUSIC_LIBRARY, type MusicTrack } from '@ugc-video/shared';
import { setProjectMusicSelection } from './music-picker-actions';

// V14 PR9 — music picker for the pre-render flow.
//
// Three things happen here, all in one card so the user sees them
// together rather than navigating between modals:
//   1. List the 13 tracks from the catalog with title + mood tags.
//      Each row has a play / pause button + an HTML5 <audio> source.
//   2. Show an "auto-select" toggle. When ON, the script's
//      music_profile drives selection at render time (legacy behavior).
//      When OFF, the user's pick wins — selectedMusicId persists to
//      productData and the render processor honors it.
//   3. Offset slider (0..120s, stepped at 1s) — controls where in the
//      track the video starts pulling music. Persisted as
//      productData.musicStartOffsetSec; ffmpeg.ts applies the offset
//      at composition time.
//
// One <audio> element is reused for the whole list (singleton); only
// one preview plays at a time. Click the same track twice to pause.

interface MusicPickerProps {
  projectId: string;
  initialSelectedTrackId: string | null;
  initialStartOffsetSec: number;
}

// Hard upper bound (10 minutes) — track-specific cap is computed from
// the selected track's durationSeconds. The slider's actual max is the
// min of the two so a 95-second track doesn't show 0..120s of empty range.
const HARD_MAX_OFFSET_SEC = 600;

export function MusicPicker({
  projectId,
  initialSelectedTrackId,
  initialStartOffsetSec,
}: MusicPickerProps) {
  const [auto, setAuto] = useState<boolean>(initialSelectedTrackId === null);
  const [trackId, setTrackId] = useState<string | null>(
    initialSelectedTrackId,
  );
  // The selected track drives the slider's max. When auto-mode is on (no
  // explicit pick) we still need SOMETHING to anchor the slider to —
  // pick the longest track so the slider can show its full range.
  const selectedTrack: MusicTrack | null = trackId
    ? (MUSIC_LIBRARY.find((t) => t.id === trackId) ?? null)
    : null;
  const sliderMaxSec = Math.min(
    HARD_MAX_OFFSET_SEC,
    selectedTrack?.durationSeconds ?? 120,
  );
  const [offsetSec, setOffsetSec] = useState<number>(
    Math.max(0, Math.min(sliderMaxSec, initialStartOffsetSec)),
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  // Live playback time of the currently-playing preview, in seconds.
  // Updated on the audio element's `timeupdate` event so the "00:32 /
  // 02:14" counter advances smoothly while preview plays.
  const [playbackTimeSec, setPlaybackTimeSec] = useState<number>(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Whenever the user picks a different track, clamp offsetSec to that
  // track's duration. Otherwise a slider that was at 200s on a 289s
  // track would silently overshoot a 95s track.
  useEffect(() => {
    if (offsetSec > sliderMaxSec) setOffsetSec(sliderMaxSec);
  }, [sliderMaxSec, offsetSec]);

  // Stop preview audio on unmount (component might be remounted on
  // route refresh).
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = '';
      }
    };
  }, []);

  function togglePreview(track: MusicTrack) {
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      a.preload = 'auto';
      a.addEventListener('ended', () => {
        setPlayingId(null);
        setPlaybackTimeSec(0);
      });
      a.addEventListener('timeupdate', () => {
        if (audioRef.current) {
          setPlaybackTimeSec(audioRef.current.currentTime);
        }
      });
      audioRef.current = a;
    }
    if (playingId === track.id) {
      a.pause();
      setPlayingId(null);
      setPlaybackTimeSec(0);
      return;
    }
    a.pause();
    // The slider is the "preview start point". Clicking ▶ starts the
    // audio from offsetSec, not from 0 — so what the user hears in the
    // preview is exactly what they'll get in the final render.
    a.src = track.fileUrl;
    const seekToBeforePlay = () => {
      if (audioRef.current) audioRef.current.currentTime = offsetSec;
    };
    if (a.readyState >= 1) {
      seekToBeforePlay();
    } else {
      a.addEventListener('loadedmetadata', seekToBeforePlay, { once: true });
    }
    a.play()
      .then(() => setPlayingId(track.id))
      .catch(() => {
        setPlayingId(null);
        setError('הדפדפן חסם השמעת תצוגה מקדימה — לחצי שוב');
      });
  }

  // Live-scrub: while a preview is playing, dragging the slider seeks
  // the audio in real time so the user can hear different start points
  // without re-clicking ▶.
  function onSliderInput(value: number) {
    const clamped = Math.max(0, Math.min(sliderMaxSec, value));
    setOffsetSec(clamped);
    if (playingId !== null && audioRef.current) {
      try {
        audioRef.current.currentTime = clamped;
        setPlaybackTimeSec(clamped);
      } catch {
        // Some browsers throw if the audio isn't ready to seek; ignore —
        // the next loadedmetadata cycle will catch up.
      }
    }
  }

  function persist(nextTrackId: string | null, nextOffsetSec: number) {
    setError(null);
    startTransition(async () => {
      const res = await setProjectMusicSelection(
        projectId,
        nextTrackId,
        nextOffsetSec,
      );
      if (!res.ok) {
        setError(
          res.error === 'invalid_track'
            ? 'הטראק שבחרת אינו זמין'
            : res.error === 'invalid_offset'
              ? 'נקודת ההתחלה לא חוקית'
              : 'שגיאה בשמירה',
        );
        return;
      }
      setSavedAt(Date.now());
    });
  }

  function flipAuto(nextAuto: boolean) {
    setAuto(nextAuto);
    if (nextAuto) {
      // Auto = clear the manual override.
      setTrackId(null);
      persist(null, offsetSec);
    } else {
      // Manual = if the user hasn't picked yet, pick the first track
      // by default so the persisted state reflects "user-driven".
      const id = trackId ?? MUSIC_LIBRARY[0]?.id ?? null;
      setTrackId(id);
      persist(id, offsetSec);
    }
  }

  function pickTrack(id: string) {
    if (auto) setAuto(false);
    setTrackId(id);
    persist(id, offsetSec);
  }

  function commitOffset(next: number) {
    const clamped = Math.max(0, Math.min(sliderMaxSec, next));
    setOffsetSec(clamped);
    persist(auto ? null : trackId, clamped);
  }

  return (
    <Card>
      <CardContent dir="rtl" className="space-y-4 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold">בחירת מוזיקת רקע</h3>
          <span className="text-xs text-muted-foreground">
            {pending
              ? 'שומר…'
              : savedAt
                ? 'נשמר'
                : 'בחירה ידנית או אוטומטית לפי תסריט'}
          </span>
        </div>

        {/* Auto / manual toggle */}
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
          <Switch
            checked={auto}
            onCheckedChange={flipAuto}
            disabled={pending}
          />
          <Label className="text-sm cursor-pointer select-none">
            בחירה אוטומטית לפי התסריט
          </Label>
          <span className="ms-auto text-xs text-muted-foreground">
            כבי כדי לבחור טראק ידני
          </span>
        </div>

        {/* Track grid (disabled state when auto) */}
        <div
          className={cn(
            'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2',
            auto && 'opacity-60 pointer-events-none',
          )}
        >
          {MUSIC_LIBRARY.map((track) => {
            const isSelected = !auto && track.id === trackId;
            const isPlaying = playingId === track.id;
            return (
              <div
                key={track.id}
                className={cn(
                  'rounded-lg border-2 px-3 py-2 transition flex flex-col gap-1',
                  isSelected
                    ? 'border-ai bg-ai/5'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={isPlaying ? 'עצור תצוגה מקדימה' : 'נגן תצוגה מקדימה'}
                    onClick={() => togglePreview(track)}
                    className={cn(
                      'shrink-0 size-7 rounded-full border bg-background flex items-center justify-center text-sm',
                      isPlaying
                        ? 'border-ai text-ai'
                        : 'border-border hover:border-foreground/50',
                    )}
                  >
                    {isPlaying ? '❚❚' : '▶'}
                  </button>
                  <button
                    type="button"
                    onClick={() => pickTrack(track.id)}
                    disabled={pending}
                    className="flex-1 text-right text-sm font-medium truncate"
                    title={track.title}
                  >
                    {track.title}
                  </button>
                  {isSelected && (
                    <span className="shrink-0 text-[10px] font-semibold text-ai">
                      ✓
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono tabular-nums">
                    {formatSec(track.durationSeconds)}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {track.energy}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {track.style.replace(/_/g, ' ')}
                  </span>
                  {track.bestFor.slice(0, 2).map((b) => (
                    <span key={b} className="rounded bg-muted px-1.5 py-0.5">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Offset slider — bounded to the selected track's duration */}
        <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <Label className="text-sm font-medium">
              נקודת התחלה בתוך הטראק
            </Label>
            <span className="text-sm tabular-nums font-mono" dir="ltr">
              {playingId !== null
                ? `${formatSec(playbackTimeSec)} / ${formatSec(sliderMaxSec)}`
                : `${formatSec(offsetSec)} / ${formatSec(sliderMaxSec)}`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={sliderMaxSec}
            step={1}
            value={offsetSec}
            onChange={(e) => onSliderInput(Number(e.target.value))}
            onMouseUp={(e) => commitOffset(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) =>
              commitOffset(Number((e.target as HTMLInputElement).value))
            }
            disabled={pending || (auto && !selectedTrack)}
            className="w-full"
          />
          {selectedTrack ? (
            <p className="text-[11px] text-muted-foreground">
              לחצי ▶ על טראק כדי לשמוע אותו מהנקודה שסימנת. גרירה בזמן
              השמעה מזיזה את הראש בזמן אמת. הסרטון הסופי יתחיל מאותה
              נקודה — אם הטראק קצר מהסרטון, הוא יתפר חלקית בלולאה רכה.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              במצב אוטומטי הטראק נבחר ברגע הרינדור לפי התסריט. בחרי
              טראק ידנית כדי להגדיר את נקודת ההתחלה.
            </p>
          )}
        </div>

        {error && (
          <div className="text-xs text-destructive">{error}</div>
        )}
      </CardContent>
    </Card>
  );
}

function formatSec(sec: number): string {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
