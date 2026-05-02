'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV: Array<{ href: string; label: string; icon: (p: { className?: string }) => React.ReactElement; group?: string }> = [
  { href: '/admin', label: 'מבט־על', icon: GaugeIcon },
  { href: '/admin/users', label: 'משתמשים', icon: UsersIcon },
  { href: '/admin/projects', label: 'פרויקטים', icon: FolderIcon },
  { href: '/admin/renders', label: 'ג׳ובי רינדור', icon: PlayIcon },
  { href: '/admin/queue', label: 'תור (BullMQ)', icon: QueueIcon },
  { href: '/admin/costs', label: 'עלויות + API', icon: DollarIcon },
  // V27.11 — debugger surfaces
  { href: '/admin/apicalls', label: 'קריאות API', icon: BugIcon, group: 'debug' },
];

export function AdminSidebar() {
  const pathname = usePathname();

  // V27 — Admin sidebar is the canonical Vercel-mode chrome surface.
  // tier-surface (no blur), dense density, primary-tone active state
  // with glow-primary, neutral hover. The previous inverted bg was too
  // loud for the V27 "chrome retreats" principle — admin is for work,
  // not a brand statement.
  return (
    <aside
      data-density="dense"
      className="w-64 border-l border-divider tier-surface flex flex-col"
    >
      <div className="p-4 border-b border-divider">
        <div className="kicker-muted font-mono text-[10px] uppercase">Admin</div>
        <div className="text-lg font-bold mt-1">לוח בקרה ניהולי</div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.filter((item) => !item.group).map((item) => {
          const Icon = item.icon;
          const active =
            item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors motion-press',
                active
                  ? 'bg-primary text-primary-foreground font-semibold glow-primary'
                  : 'text-fg-secondary hover:bg-elevated hover:text-fg',
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* V27.11 — debugger group */}
        <div className="mt-4 pt-3 border-t border-divider">
          <div className="kicker-muted font-mono text-[10px] uppercase mb-2 px-3">דיבאגר</div>
          {NAV.filter((item) => item.group === 'debug').map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors motion-press',
                  active
                    ? 'bg-primary text-primary-foreground font-semibold glow-primary'
                    : 'text-fg-secondary hover:bg-elevated hover:text-fg',
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <p className="px-3 mt-2 text-[10px] text-fg-tertiary leading-relaxed">
            כדי לדבג פרויקט/סצנה: לחץ "פרויקטים" → בחר פרויקט → "debug →"
          </p>
        </div>
      </nav>

      <div className="p-4 border-t border-divider">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-fg-tertiary hover:text-fg motion-press"
        >
          <span>←</span>
          <span>חזרה לדאשבורד משתמש</span>
        </Link>
      </div>
    </aside>
  );
}

function GaugeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0" />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function QueueIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function DollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
function BugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="6" width="8" height="14" rx="4" />
      <path d="M19 7l-3 2M5 7l3 2M19 13h-3M5 13h3M19 19l-3-2M5 19l3-2M12 6V4M9 4l3-2 3 2" />
    </svg>
  );
}
