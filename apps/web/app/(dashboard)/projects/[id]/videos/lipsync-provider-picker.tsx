'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Per-project LipSync provider picker. Saves to
// Project.productData.lipsyncProvider via POST /api/projects/[id]/lipsync-provider.
// clip-impl.ts reads that value first; empty falls back to LIPSYNC_PROVIDER env.
//
// Why exposed at the project level (not global env): we want to A/B
// Kling vs PixVerse vs Sync.so on real projects before picking a
// default. Each project can carry its own preference; existing
// projects without the field continue to use the env.

interface ProviderOption {
  slug: string;
  label: string;
  hint: string;
}

const PROVIDERS: ProviderOption[] = [
  { slug: '', label: 'ברירת מחדל', hint: 'משתמש ב-LIPSYNC_PROVIDER מה-env' },
  { slug: 'kling', label: 'Kling LipSync v1', hint: 'הותיק והבדוק. עבודה טובה על אנגלית, ממוצעת על עברית.' },
  { slug: 'pixverse', label: 'PixVerse LipSync', hint: 'אלטרנטיבה — שווה לבדוק על עברית.' },
  { slug: 'sync', label: 'Sync.so (sync-3)', hint: 'דורש SYNC_API_KEY ב-env.' },
  { slug: 'mock', label: 'Mock (passthrough)', hint: 'בלי lipsync — להריץ ללא חיוב, רק לפיתוח.' },
];

export function LipsyncProviderPicker({
  projectId,
  currentProvider,
}: {
  projectId: string;
  currentProvider: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(currentProvider ?? '');

  const apply = (slug: string) => {
    setError(null);
    setSelected(slug);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/lipsync-provider`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: slug }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
        };
        if (!res.ok || !json.success) {
          setError(json.error ?? 'שמירה נכשלה');
          return;
        }
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  const currentOption = PROVIDERS.find((p) => p.slug === selected) ?? PROVIDERS[0];

  return (
    <Card className="bg-secondary/30 border-border/50">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              ספק LipSync
            </div>
            <div className="font-semibold flex items-center gap-2">
              {currentOption?.label ?? 'ברירת מחדל'}
              {selected !== '' && <Badge variant="muted">override</Badge>}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {currentOption?.hint}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => {
              const active = p.slug === selected;
              return (
                <button
                  key={p.slug || 'default'}
                  type="button"
                  onClick={() => apply(p.slug)}
                  disabled={pending || active}
                  title={p.hint}
                  className={[
                    'text-xs px-2 py-1 rounded border transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:bg-muted',
                    pending && !active ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  {p.slug || 'env'}
                </button>
              );
            })}
          </div>
        </div>
        {error && (
          <div className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1">
            {error}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">
          ⚠ ההגדרה משפיעה על כל הקליפים החדשים בפרויקט הזה. רגנור קליפ קיים עם ספק חדש אומר עוד $0.55-$0.79.
        </div>
      </CardContent>
    </Card>
  );
}
