'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Status =
  | 'idle'
  | 'pending'
  | 'extracting_assets'
  | 'generating_voice'
  | 'generating_avatar_video'
  | 'generating_broll'
  | 'composing_video'
  | 'uploading_final'
  | 'completed'
  | 'failed'
  | 'cancelled';

const STATUS_LABELS: Record<Status, string> = {
  idle: 'ממתין להפעלה',
  pending: 'ממתין בתור',
  extracting_assets: 'מחלץ משאבים',
  generating_voice: 'יוצר קריינות',
  generating_avatar_video: 'יוצר וידאו אווטאר',
  generating_broll: 'יוצר קטעי B-Roll',
  composing_video: 'מרכיב את הוידאו',
  uploading_final: 'מעלה את הקובץ הסופי',
  completed: 'הסתיים בהצלחה',
  failed: 'נכשל',
  cancelled: 'בוטל',
};

const STEPS: Status[] = [
  'pending',
  'extracting_assets',
  'generating_voice',
  'generating_avatar_video',
  'generating_broll',
  'composing_video',
  'uploading_final',
  'completed',
];

export default function DevDemo() {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const start = async () => {
    setError(null);
    setFinalUrl(null);
    setStatus('pending');
    setProgress(0);

    const res = await fetch('/api/demo/start', { method: 'POST' });
    if (!res.ok) {
      setError(`שגיאה ביצירת ג׳וב: HTTP ${res.status}`);
      setStatus('failed');
      return;
    }
    const data = await res.json();
    setJobId(data.jobId);

    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/render/${data.jobId}/status`);
      if (!r.ok) return;
      const j = await r.json();
      setStatus(j.status);
      setProgress(j.progressPercent);
      if (j.status === 'completed') {
        setFinalUrl(j.finalVideoUrl);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (j.status === 'failed') {
        setError(j.errorMessage || 'הג׳וב נכשל');
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 500);
  };

  const isRunning =
    status !== 'idle' && status !== 'completed' && status !== 'failed' && status !== 'cancelled';

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Dev · Mock pipeline</div>
        <h1 className="text-3xl font-bold tracking-tight">דמו מנוע הרינדור</h1>
        <p className="text-sm text-muted-foreground max-w-xl">
          זהו מסך Dev שמדמה את כל הצינור (TTS → אווטאר → B-Roll → קומפוזיציה) עם ספקי mock.
          ה־URL הסופי מזויף, אבל ה־DB, ה־Queue וה־Worker אמיתיים.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">סטטוס</div>
              <div className="text-xl font-semibold">{STATUS_LABELS[status]}</div>
            </div>
            <Button onClick={start} disabled={isRunning}>
              {isRunning ? 'רץ…' : 'הפעל ג׳וב מוק'}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">התקדמות</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  status === 'failed'
                    ? 'bg-destructive'
                    : status === 'completed'
                      ? 'bg-accent'
                      : 'bg-primary'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <ol className="space-y-1.5 text-sm">
            {STEPS.map((step) => {
              const stepIndex = STEPS.indexOf(step);
              const currentIndex = STEPS.indexOf(status as Status);
              const isDone =
                status === 'completed' ||
                (currentIndex > stepIndex && currentIndex !== -1);
              const isActive = status === step;
              return (
                <li
                  key={step}
                  className={`flex items-center gap-3 ${isDone || isActive ? '' : 'opacity-40'}`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono flex-shrink-0 ${
                      isDone
                        ? 'bg-accent text-accent-foreground'
                        : isActive
                          ? 'bg-primary text-primary-foreground animate-pulse'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isDone ? '✓' : stepIndex + 1}
                  </span>
                  <span className={isActive ? 'font-medium' : ''}>{STATUS_LABELS[step]}</span>
                </li>
              );
            })}
          </ol>

          {jobId && (
            <div className="text-xs text-muted-foreground font-mono break-all border-t pt-4" dir="ltr">
              jobId: {jobId}
            </div>
          )}

          {finalUrl && (
            <div className="bg-accent/15 border border-accent/40 rounded-md p-4 space-y-1">
              <div className="text-sm font-semibold">URL סופי (mock)</div>
              <div className="text-xs font-mono break-all" dir="ltr">{finalUrl}</div>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4">
              <div className="text-sm font-semibold text-destructive">שגיאה</div>
              <div className="text-xs text-destructive/80 mt-1">{error}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
