'use client';

import { useMemo, useState } from 'react';
import {
  AVATAR_CATALOG,
  ALL_AGE_RANGES,
  type AvatarGender,
  type AvatarAgeRange,
} from '@/lib/avatars/catalog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  initialSelectedId: string | null;
  selectAction: (formData: FormData) => Promise<void>;
  continueAction: (formData: FormData) => Promise<void>;
}

export function AvatarPicker({ projectId, initialSelectedId, selectAction, continueAction }: Props) {
  const [genderFilter, setGenderFilter] = useState<AvatarGender | 'all'>('all');
  const [ageFilter, setAgeFilter] = useState<AvatarAgeRange | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  const filtered = useMemo(() => {
    return AVATAR_CATALOG.filter((a) => {
      if (genderFilter !== 'all' && a.gender !== genderFilter) return false;
      if (ageFilter !== 'all' && a.ageRange !== ageFilter) return false;
      return true;
    });
  }, [genderFilter, ageFilter]);

  const handleSelect = (avatarId: string) => {
    setSelectedId(avatarId);
    const fd = new FormData();
    fd.set('projectId', projectId);
    fd.set('avatarId', avatarId);
    void selectAction(fd);
  };

  return (
    <div className="space-y-6">
      {/* Filter pills */}
      <div className="space-y-3">
        <FilterRow label="מגדר">
          <FilterChip active={genderFilter === 'all'} onClick={() => setGenderFilter('all')}>
            הכל
          </FilterChip>
          <FilterChip active={genderFilter === 'female'} onClick={() => setGenderFilter('female')}>
            נשים
          </FilterChip>
          <FilterChip active={genderFilter === 'male'} onClick={() => setGenderFilter('male')}>
            גברים
          </FilterChip>
        </FilterRow>

        <FilterRow label="טווח גיל">
          <FilterChip active={ageFilter === 'all'} onClick={() => setAgeFilter('all')}>
            הכל
          </FilterChip>
          {ALL_AGE_RANGES.map((r) => (
            <FilterChip key={r} active={ageFilter === r} onClick={() => setAgeFilter(r)}>
              {r}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          אין אווטארים בפילטר הזה. נסה משהו אחר.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((a) => {
            const selected = selectedId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handleSelect(a.id)}
                className={cn(
                  'group relative aspect-[3/4] rounded-lg overflow-hidden bg-muted border-2 transition-all',
                  selected
                    ? 'border-primary ring-4 ring-primary/20 shadow-lg'
                    : 'border-transparent hover:border-primary/40',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.imageUrl}
                  alt={a.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <div className="text-xs font-semibold text-white">{a.name}</div>
                  <div className="text-[10px] text-white/70 font-mono">{a.ageRange}</div>
                </div>
                {selected && (
                  <div className="absolute top-2 end-2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow">
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pt-4" dir="ltr">
        <div className="text-xs text-muted-foreground">
          {selectedId ? `נבחר: ${AVATAR_CATALOG.find((x) => x.id === selectedId)?.name}` : 'לא נבחר אווטאר'}
        </div>
        <form action={continueAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="submit" size="lg" disabled={!selectedId}>
            המשך לתסריט →
          </Button>
        </form>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-muted-foreground w-16">{label}:</span>
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
