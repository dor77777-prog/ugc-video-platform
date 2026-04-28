'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteProjectAction } from './actions';

export function DeleteProjectButton({ projectId, productName }: { projectId: string; productName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
        title="מחק את הפרויקט לצמיתות"
      >
        🗑 מחק
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-destructive whitespace-nowrap">
        למחוק את &quot;{productName}&quot;?
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const fd = new FormData();
            fd.set('projectId', projectId);
            const res = await deleteProjectAction(fd);
            if (!res.ok) {
              setError(res.error ?? 'שגיאה');
              return;
            }
            router.refresh();
          });
        }}
        className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
      >
        {pending ? '…' : 'כן, מחק'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
      >
        ביטול
      </button>
      {error && <span className="text-[10px] text-destructive">{error}</span>}
    </div>
  );
}
