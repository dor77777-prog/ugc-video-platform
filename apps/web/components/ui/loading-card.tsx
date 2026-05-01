'use client';

import { ProgressBar } from './progress-bar';
import { ElapsedTimer } from './elapsed-timer';
import { Card, CardContent } from './card';

// A polished "waiting on AI" card. Drop in anywhere a long-running action is
// pending. Keeps users from thinking the page is stuck.
export function LoadingCard({
  title,
  subtitle,
  hint,
  emoji = '✨',
}: {
  title: string;
  subtitle?: string;
  hint?: string;
  emoji?: string;
}) {
  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="p-6 space-y-4 text-center">
        <div className="text-4xl motion-shimmer">{emoji}</div>
        <div className="space-y-1">
          <div className="text-base font-semibold">{title}</div>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        <ProgressBar />
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>זמן שעבר:</span>
          <ElapsedTimer />
        </div>
        {hint && <div className="text-xs text-muted-foreground/70 mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
