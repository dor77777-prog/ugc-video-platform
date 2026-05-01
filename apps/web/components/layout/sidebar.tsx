'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PlusCircle,
  Library,
  Settings,
  Beaker,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Pin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// V21.1 — sidebar with workspace context: top section is fixed nav,
// middle is a "Pinned projects" list (recent 5 projects from layout),
// bottom is the upgrade-plan promo. Active route highlights with
// shadow-glow. Active project (when URL is /projects/<id>/...) gets
// a primary highlight in the pinned list.

interface RecentProject {
  id: string;
  name: string;
  isCompleted: boolean;
}

const NAV_ITEMS: SidebarItem[] = [
  { href: '/dashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/projects/new', label: 'צור סרטון מוצר', icon: PlusCircle, accent: true },
  { href: '/library', label: 'ספריית וידאו', icon: Library },
];

const SECONDARY_NAV: SidebarItem[] = [
  { href: '/settings', label: 'הגדרות', icon: Settings },
  { href: '/dev/demo', label: 'דמו מנוע (dev)', icon: Beaker },
];

interface SidebarItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}

export function Sidebar({ recentProjects = [] }: { recentProjects?: RecentProject[] }) {
  const pathname = usePathname();
  // Detect "current project" from URL — used to highlight the matching
  // pinned card. Path looks like /projects/<id>/scripts.
  const projectMatch = pathname.match(/^\/projects\/([^\/]+)/);
  const activeProjectId = projectMatch?.[1] ?? null;

  return (
    <aside className="hidden md:flex w-64 border-l border-border-subtle bg-card/40 backdrop-blur-md flex-col flex-shrink-0">
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {/* PRIMARY NAV */}
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.25em] px-3 mb-3">
          תפריט
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}

        {/* PINNED PROJECTS */}
        {recentProjects.length > 0 && (
          <>
            <div className="pt-6 flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.25em] px-3 mb-3">
              <Pin className="h-3 w-3" />
              פרויקטים אחרונים
            </div>
            {recentProjects.map((p) => {
              const isActiveProject = p.id === activeProjectId;
              const StatusIcon = p.isCompleted ? CheckCircle2 : CircleDashed;
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}/${p.isCompleted ? 'videos' : 'scripts'}`}
                  className={cn(
                    'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-all',
                    isActiveProject
                      ? 'bg-primary/15 border border-primary/30 text-foreground font-semibold'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )}
                  title={p.name}
                >
                  <StatusIcon
                    className={cn(
                      'h-3.5 w-3.5 flex-shrink-0',
                      p.isCompleted ? 'text-ai' : 'text-primary',
                    )}
                  />
                  <span className="truncate flex-1">{p.name}</span>
                  {isActiveProject && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary motion-pulse-ai flex-shrink-0" />
                  )}
                </Link>
              );
            })}
          </>
        )}

        {/* SECONDARY NAV */}
        <div className="pt-6 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.25em] px-3 mb-3">
          עזרה
        </div>
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <div className="p-4 border-t border-border-subtle">
        <Link
          href="/pricing"
          className="block rounded-2xl bg-gradient-to-br from-primary via-primary/85 to-primary/60 text-primary-foreground p-4 space-y-2 hover:opacity-95 transition-all hover:scale-[1.02] shadow-glow"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <div className="text-sm font-bold">שדרג את התוכנית</div>
          </div>
          <div className="text-[11px] opacity-90 leading-snug">
            יותר קרדיטים, יותר lipsync, יצוא MP4 מלא.
          </div>
          <div className="w-full mt-2 bg-ai text-ai-foreground text-xs font-bold py-1.5 rounded-lg flex items-center justify-center gap-1.5">
            ראה תוכניות
            <ArrowLeft className="h-3 w-3" />
          </div>
        </Link>
      </div>
    </aside>
  );
}

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(href);
}

function NavLink({ item, active }: { item: SidebarItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
        active
          ? 'bg-primary text-primary-foreground font-semibold shadow-glow'
          : item.accent
            ? 'text-primary font-semibold hover:bg-primary/10'
            : 'text-foreground hover:bg-secondary',
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}
