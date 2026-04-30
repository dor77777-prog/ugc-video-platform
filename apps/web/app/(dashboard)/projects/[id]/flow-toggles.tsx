'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  setProjectFlowToggle,
  type FlowToggleKey,
} from './flow-toggle-actions';

interface FlowTogglesProps {
  projectId: string;
  initialCaptions: boolean;
  initialBackgroundMusic: boolean;
}

// Persistent flow toggles for captions + background music. Rendered by
// the project layout so they appear on every wizard step up through
// render. Flipping a toggle writes to productData via a server action
// and revalidates the project route so any server-rendered consumer
// (videos page caption-preset picker, render-processor) sees the new
// state on the next request.
export function ProjectFlowToggles({
  projectId,
  initialCaptions,
  initialBackgroundMusic,
}: FlowTogglesProps) {
  const router = useRouter();
  const [captions, setCaptions] = useState(initialCaptions);
  const [music, setMusic] = useState(initialBackgroundMusic);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function flip(
    key: FlowToggleKey,
    next: boolean,
    setLocal: (v: boolean) => void,
    prev: boolean,
  ) {
    setLocal(next); // optimistic
    setError(null);
    startTransition(async () => {
      const res = await setProjectFlowToggle(projectId, key, next);
      if (!res.ok) {
        setLocal(prev); // revert
        setError(
          res.error === 'not_found'
            ? 'הפרויקט לא נמצא'
            : 'שגיאה בעדכון ההעדפה',
        );
        return;
      }
      // Re-render server components on the current page so the videos
      // page picks up the new captions/music state and shows or hides
      // the caption-preset picker accordingly.
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/30 px-4 py-3',
        pending && 'opacity-70',
      )}
      dir="rtl"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          העדפות סרטון
        </div>
        <div className="flex items-center gap-6">
          <ToggleInline
            label="כתוביות"
            checked={captions}
            onCheckedChange={(v) => flip('captions', v, setCaptions, captions)}
            disabled={pending}
          />
          <ToggleInline
            label="מוזיקה"
            checked={music}
            onCheckedChange={(v) =>
              flip('backgroundMusic', v, setMusic, music)
            }
            disabled={pending}
          />
        </div>
      </div>
      {error && (
        <div className="text-xs text-destructive pt-2">{error}</div>
      )}
    </div>
  );
}

function ToggleInline({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <Label className="text-sm font-medium cursor-pointer select-none">
        {label}
      </Label>
    </div>
  );
}
