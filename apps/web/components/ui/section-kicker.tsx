// V23 — section kicker label, the small uppercase mono tag that
// appears above every major section on the landing ("הדמויות · The
// Cast" / "הצינור · The Pipeline" / "FAQ"). Reused on the dashboard
// + inner pages so every page section has the same premium kicker
// rhythm.

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function SectionKicker({
  text,
  english,
  icon: Icon,
  className,
}: {
  text: string;
  /** Optional secondary English label, rendered after a middot. */
  english?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-primary font-mono',
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{text}</span>
      {english && (
        <>
          <span className="text-muted-foreground/60">·</span>
          <span className="text-muted-foreground">{english}</span>
        </>
      )}
    </div>
  );
}
