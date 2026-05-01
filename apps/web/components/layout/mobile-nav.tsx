'use client';

// V24 — mobile navigation drawer. The desktop sidebar (w-64) is
// hidden on screens < md; the topbar instead shows a hamburger button
// that opens this overlay drawer on the right (RTL) side. Renders the
// same nav structure as <Sidebar /> so users have the same access on
// mobile.
//
// Closes on:
// - clicking the backdrop
// - clicking a nav link (route change)
// - ESC key

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PlusCircle,
  Library,
  Settings,
  Menu,
  X,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Pin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecentProject {
  id: string;
  name: string;
  isCompleted: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'לוח בקרה', icon: LayoutDashboard },
  { href: '/projects/new', label: 'צור סרטון מוצר', icon: PlusCircle, accent: true },
  { href: '/library', label: 'ספריית וידאו', icon: Library },
];

const SECONDARY_NAV: NavItem[] = [
  { href: '/settings', label: 'הגדרות', icon: Settings },
];

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}

export function MobileNav({ recentProjects = [] }: { recentProjects?: RecentProject[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on ESC.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    // Lock body scroll while open.
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open]);

  const projectMatch = pathname.match(/^\/projects\/([^\/]+)/);
  const activeProjectId = projectMatch?.[1] ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="פתח תפריט"
        className="md:hidden flex items-center justify-center h-11 w-11 rounded-lg border border-border-subtle bg-card/40 backdrop-blur-md text-foreground hover:bg-secondary transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm motion-fade-up"
            onClick={() => setOpen(false)}
          />

          {/* Drawer panel — slides in from the right (RTL "starting" side) */}
          <aside
            className="absolute top-0 right-0 bottom-0 w-[300px] max-w-[85vw] bg-card/95 backdrop-blur-2xl border-l border-border-subtle shadow-floating overflow-y-auto motion-fade-up"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-background/80 backdrop-blur-xl">
              <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                תפריט
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגור תפריט"
                className="h-9 w-9 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="p-4 space-y-1">
              {NAV_ITEMS.map((item) => (
                <DrawerLink key={item.href} item={item} active={isActive(pathname, item.href)} />
              ))}

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
                          'flex items-center gap-2.5 px-3 py-3 rounded-lg text-sm transition-all min-h-[44px]',
                          isActiveProject
                            ? 'bg-primary/15 border border-primary/30 text-foreground font-semibold'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                        )}
                      >
                        <StatusIcon
                          className={cn(
                            'h-4 w-4 flex-shrink-0',
                            p.isCompleted ? 'text-ai' : 'text-primary',
                          )}
                        />
                        <span className="truncate flex-1">{p.name}</span>
                      </Link>
                    );
                  })}
                </>
              )}

              <div className="pt-6 text-[10px] font-bold text-muted-foreground uppercase tracking-[0.25em] px-3 mb-3">
                עזרה
              </div>
              {SECONDARY_NAV.map((item) => (
                <DrawerLink key={item.href} item={item} active={isActive(pathname, item.href)} />
              ))}
            </nav>

            <div className="p-4 border-t border-border-subtle">
              <Link
                href="/pricing"
                className="block rounded-2xl bg-gradient-to-br from-primary via-primary/85 to-primary/60 text-primary-foreground p-4 space-y-2 hover:opacity-95 transition-all shadow-glow"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <div className="text-sm font-bold">שדרג את התוכנית</div>
                </div>
                <div className="text-[11px] opacity-90 leading-snug">
                  יותר קרדיטים, יותר lipsync, יצוא MP4 מלא.
                </div>
                <div className="w-full mt-2 bg-ai text-ai-foreground text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5">
                  ראה תוכניות
                  <ArrowLeft className="h-3 w-3" />
                </div>
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(href);
}

function DrawerLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all min-h-[44px]',
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
