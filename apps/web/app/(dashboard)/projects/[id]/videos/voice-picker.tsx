'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  VOICE_PRESETS,
  ALL_VOICE_GENDERS,
  ALL_VOICE_AGE_RANGES,
  ALL_VOICE_ENERGIES,
  VOICE_ENERGY_LABEL_HE,
  type VoicePreset,
  type VoiceGender,
  type VoiceAgeRange,
  type VoiceEnergy,
} from '@/lib/voice/voice-presets';

// Picker UI mirrors the AvatarPicker pattern from step 2 — chip filters
// (gender / age / energy), sample preview on click, "Continue" button to
// persist the choice via the project voice endpoint.

export function VoicePicker({
  projectId,
  initialVoiceId,
  onPicked,
}: {
  projectId: string;
  initialVoiceId: string | null;
  onPicked?: () => void;
}) {
  const router = useRouter();
  const [genderFilter, setGenderFilter] = useState<VoiceGender | 'all'>('all');
  const [ageFilter, setAgeFilter] = useState<VoiceAgeRange | 'all'>('all');
  const [energyFilter, setEnergyFilter] = useState<VoiceEnergy | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialVoiceId);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // One shared <audio> instance so only one preview plays at a time.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return VOICE_PRESETS.filter((v) => {
      if (genderFilter !== 'all' && v.gender !== genderFilter) return false;
      if (ageFilter !== 'all' && v.ageRange !== ageFilter) return false;
      if (energyFilter !== 'all' && v.energy !== energyFilter) return false;
      return true;
    });
  }, [genderFilter, ageFilter, energyFilter]);

  const [loadingId, setLoadingId] = useState<string | null>(null);

  const togglePreview = async (preset: VoicePreset) => {
    if (playingId === preset.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) audioRef.current.pause();

    // First click on a fresh voice: the API endpoint synthesizes the sample
    // (~3-5 seconds). Subsequent clicks come from disk cache (instant).
    // We fetch via fetch() (not <audio src>) so we can read the JSON error
    // body when ElevenLabs returns a quota/auth failure — otherwise the
    // <audio> element only fires a generic "error" event with no detail.
    setLoadingId(preset.id);
    setError(null);

    let blobUrl: string;
    try {
      const res = await fetch(preset.sampleUrl);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          reason?: string;
          detail?: string;
        } | null;
        setLoadingId(null);
        setError(formatSampleError(preset.displayName, data?.reason, data?.detail));
        return;
      }
      const blob = await res.blob();
      blobUrl = URL.createObjectURL(blob);
    } catch (err) {
      setLoadingId(null);
      setError(
        `הדגימה של ${preset.displayName} לא נטענה (שגיאת רשת: ${
          (err as Error).message || 'unknown'
        }).`,
      );
      return;
    }

    const audio = new Audio(blobUrl);
    audioRef.current = audio;
    audio.addEventListener('ended', () => {
      setPlayingId(null);
      URL.revokeObjectURL(blobUrl);
    });
    audio.addEventListener('error', () => {
      setLoadingId(null);
      setPlayingId(null);
      URL.revokeObjectURL(blobUrl);
      setError(`הדגימה של ${preset.displayName} לא נטענה (פורמט שמע לא תקין).`);
    });
    try {
      await audio.play();
      setLoadingId(null);
      setPlayingId(preset.id);
    } catch {
      setLoadingId(null);
      setPlayingId(null);
      URL.revokeObjectURL(blobUrl);
      setError(`לא ניתן היה להפעיל את ${preset.displayName}. נסה שוב.`);
    }
  };

  const save = () => {
    if (!selectedId) return;
    setError(null);
    startSaving(async () => {
      const res = await fetch(`/api/projects/${projectId}/voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: selectedId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'שמירת הקול נכשלה');
        return;
      }
      // Stop any preview currently playing.
      if (audioRef.current) audioRef.current.pause();
      setPlayingId(null);
      onPicked?.();
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">בחר קול לפרויקט</h2>
        <p className="text-sm text-muted-foreground">
          הקול הזה ישמש לכל הסצנות בסרטון, כדי שהקריינות תישמע עקבית. אפשר לשנות אחר כך,
          אבל אז יהיה צורך לרגנר את כל ה-voice-overs.
        </p>
      </div>

      <div className="space-y-3">
        <FilterRow label="מגדר">
          <FilterChip active={genderFilter === 'all'} onClick={() => setGenderFilter('all')}>
            הכל
          </FilterChip>
          {ALL_VOICE_GENDERS.map((g) => (
            <FilterChip key={g} active={genderFilter === g} onClick={() => setGenderFilter(g)}>
              {g === 'female' ? 'נשים' : 'גברים'}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="טווח גיל">
          <FilterChip active={ageFilter === 'all'} onClick={() => setAgeFilter('all')}>
            הכל
          </FilterChip>
          {ALL_VOICE_AGE_RANGES.map((r) => (
            <FilterChip key={r} active={ageFilter === r} onClick={() => setAgeFilter(r)}>
              {r}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="אנרגיה">
          <FilterChip active={energyFilter === 'all'} onClick={() => setEnergyFilter('all')}>
            הכל
          </FilterChip>
          {ALL_VOICE_ENERGIES.map((e) => (
            <FilterChip key={e} active={energyFilter === e} onClick={() => setEnergyFilter(e)}>
              {VOICE_ENERGY_LABEL_HE[e]}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((preset) => {
          const selected = selectedId === preset.id;
          const playing = playingId === preset.id;
          return (
            <div
              key={preset.id}
              className={cn(
                'rounded-lg border-2 p-4 cursor-pointer transition-all bg-card',
                selected
                  ? 'border-primary ring-4 ring-primary/15 shadow-md'
                  : 'border-border hover:border-primary/40',
              )}
              onClick={() => setSelectedId(preset.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-tight">
                    {preset.displayName}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {preset.gender === 'female' ? 'אישה' : 'גבר'} · {preset.ageRange} · {VOICE_ENERGY_LABEL_HE[preset.energy]}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePreview(preset);
                  }}
                  disabled={loadingId === preset.id}
                  className={cn(
                    'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                    playing
                      ? 'bg-primary text-primary-foreground'
                      : loadingId === preset.id
                        ? 'bg-foreground/20 text-foreground'
                        : 'bg-foreground/10 hover:bg-foreground/20 text-foreground',
                  )}
                  aria-label={playing ? 'Pause' : loadingId === preset.id ? 'Loading' : 'Play sample'}
                >
                  {loadingId === preset.id ? (
                    <span className="text-xs animate-pulse">…</span>
                  ) : playing ? (
                    <span className="text-xs">⏸</span>
                  ) : (
                    <span className="ms-0.5 text-xs">▶</span>
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                {preset.description}
              </p>
              {selected && (
                <div className="mt-2 text-[11px] font-semibold text-primary">✓ נבחר</div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2" dir="ltr">
        <div className="text-xs text-muted-foreground">
          {selectedId
            ? `נבחר: ${VOICE_PRESETS.find((v) => v.id === selectedId)?.displayName}`
            : 'לא נבחר עדיין'}
        </div>
        <Button onClick={save} disabled={!selectedId || saving} size="lg">
          {saving ? 'שומר…' : 'שמור קול וצור voice-overs'}
        </Button>
      </div>
    </div>
  );
}

function formatSampleError(displayName: string, reason?: string, detail?: string): string {
  switch (reason) {
    case 'quota_exceeded':
      return `מפתח ElevenLabs נגמרו לו הקרדיטים. בקר ב-elevenlabs.io/app/settings/api-keys, הגדל את ה-quota על המפתח (או צור חדש), והעדכן ב-.env.`;
    case 'paid_plan_required':
      return `הקול הזה הוא Library voice של ElevenLabs ודורש תוכנית בתשלום (Starter $6/חודש ומעלה). בחר אחד מקולות ה-Default או שדרג ב-elevenlabs.io/pricing.`;
    case 'invalid_api_key':
      return `מפתח ElevenLabs נדחה (401). ודא שה-ELEVENLABS_API_KEY תקף ב-.env.`;
    case 'not_configured':
      return `מפתח ElevenLabs (ELEVENLABS_API_KEY) לא הוגדר ב-.env. הוסף אותו והפעל את השרת מחדש.`;
    default:
      return `הדגימה של ${displayName} לא נטענה. ${detail ? `(${detail.slice(0, 200)})` : 'נסה שוב.'}`;
  }
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-muted-foreground w-20">{label}:</span>
      <div className="flex gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1 rounded-md text-xs font-medium transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'bg-muted text-muted-foreground hover:bg-secondary',
      )}
    >
      {children}
    </button>
  );
}
