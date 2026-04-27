'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { generateScriptsAction, type GenerateState } from './actions';

export function GenerateButton({
  projectId,
  regenerate = false,
}: {
  projectId: string;
  regenerate?: boolean;
}) {
  const action = generateScriptsAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<GenerateState, FormData>(
    action,
    undefined,
  );

  return (
    <div className="space-y-3 inline-block">
      <form action={formAction}>
        <Button size={regenerate ? 'default' : 'lg'} variant={regenerate ? 'outline' : 'default'} disabled={pending}>
          {pending
            ? 'ה-AI חושב…'
            : regenerate
              ? '↻ צור תסריטים מחדש'
              : '✨ צור 6 תסריטים'}
        </Button>
      </form>
      {state?.error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2 text-start max-w-md">
          {state.error}
        </div>
      )}
    </div>
  );
}

interface ScriptCardProps {
  scriptId: string;
  projectId: string;
  angleLabel: string;
  hook: string;
  cta: string;
  estimatedDurationSeconds: number;
  scenes: { sceneOrder: number; textHebrew: string; durationSeconds: number }[];
  isSelected: boolean;
  selectAction: (formData: FormData) => Promise<void>;
}

export function ScriptCard({
  scriptId,
  projectId,
  angleLabel,
  hook,
  cta,
  estimatedDurationSeconds,
  scenes,
  isSelected,
  selectAction,
}: ScriptCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className={cn(
        'transition-all',
        isSelected
          ? 'border-primary border-2 shadow-md ring-4 ring-primary/15'
          : 'hover:border-primary/40',
      )}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <Badge variant={isSelected ? 'default' : 'outline'}>{angleLabel}</Badge>
          <div className="text-xs text-muted-foreground font-mono">
            {estimatedDurationSeconds}s · {scenes.length} סצנות
          </div>
        </div>

        <h3 className="text-xl font-bold leading-snug">{hook}</h3>

        <div className="text-sm text-foreground/80 line-clamp-3 leading-relaxed">
          {scenes[0]?.textHebrew}
        </div>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-border">
            {scenes.map((s) => (
              <div key={s.sceneOrder} className="text-sm space-y-1">
                <div className="text-xs text-muted-foreground font-mono">
                  סצנה {s.sceneOrder + 1} · {s.durationSeconds}s
                </div>
                <div className="leading-relaxed">{s.textHebrew}</div>
              </div>
            ))}
            {cta && (
              <div className="text-sm font-semibold text-primary border-t border-border pt-3">
                CTA: {cta}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'הסתר' : 'ראה תסריט מלא'}
          </button>

          <form action={selectAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="scriptId" value={scriptId} />
            <Button
              type="submit"
              variant={isSelected ? 'default' : 'secondary'}
              size="sm"
            >
              {isSelected ? '✓ נבחר' : 'בחר תסריט זה'}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
