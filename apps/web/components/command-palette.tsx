'use client';

// V16 — global Cmd+K command palette. Lives at the root of the
// (dashboard) layout so it's available on every authenticated page.
// Provides quick navigation + actions:
//   - Open dashboard / library / pricing / settings
//   - Create new project
//   - View admin pages (only when user is admin — but the palette
//     itself doesn't gate; routes will redirect non-admins)
//
// Powered by `cmdk` (https://cmdk.paco.me) which gives us the keyboard
// nav + filtering for free. The shortcut hint at the bottom-right is
// just visual; the open trigger is `Cmd/Ctrl + K`.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Sparkles,
  LayoutDashboard,
  Library,
  CreditCard,
  Settings,
  ShieldCheck,
  Search,
  PlusCircle,
} from 'lucide-react';

interface PaletteItem {
  group: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string[];
  shortcut?: string;
}

const ITEMS: PaletteItem[] = [
  {
    group: 'יצירה',
    label: 'פרויקט חדש',
    href: '/projects/new',
    icon: PlusCircle,
    keywords: ['new', 'create', 'project', 'יצירה', 'חדש'],
    shortcut: 'N',
  },
  {
    group: 'ניווט',
    label: 'לוח בקרה',
    href: '/dashboard',
    icon: LayoutDashboard,
    keywords: ['dashboard', 'home', 'בית'],
    shortcut: 'D',
  },
  {
    group: 'ניווט',
    label: 'הספרייה (סרטונים מוכנים)',
    href: '/library',
    icon: Library,
    keywords: ['library', 'videos', 'finished', 'ספריה'],
    shortcut: 'L',
  },
  {
    group: 'ניווט',
    label: 'מחירים + שדרוג מנוי',
    href: '/pricing',
    icon: CreditCard,
    keywords: ['pricing', 'upgrade', 'מחירים', 'תוכנית'],
  },
  {
    group: 'ניווט',
    label: 'הגדרות',
    href: '/settings',
    icon: Settings,
    keywords: ['settings', 'profile', 'הגדרות'],
  },
  {
    group: 'אדמין',
    label: 'Admin · Costs',
    href: '/admin/costs',
    icon: ShieldCheck,
    keywords: ['admin', 'costs', 'spend', 'usage'],
  },
  {
    group: 'אדמין',
    label: 'Admin · Users',
    href: '/admin/users',
    icon: ShieldCheck,
    keywords: ['admin', 'users'],
  },
  {
    group: 'אדמין',
    label: 'Admin · Queue',
    href: '/admin/queue',
    icon: ShieldCheck,
    keywords: ['admin', 'queue', 'jobs', 'render'],
  },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Floating hint at the bottom-right corner — encourages discovery. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-lg tier-elevated border-border-subtle text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors shadow-lg"
        aria-label="פתח חיפוש מהיר"
      >
        <Search className="h-3.5 w-3.5" />
        <span>חיפוש</span>
        <kbd className="text-[10px] font-mono bg-muted/40 px-1.5 py-0.5 rounded border border-border">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/40 backdrop-blur-sm motion-fade-up"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl mx-4 rounded-2xl tier-elevated shadow-2xl overflow-hidden border border-primary/20"
          >
            <Command label="Command Menu" className="bg-transparent">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle">
                <Sparkles className="h-4 w-4 text-primary" />
                <Command.Input
                  autoFocus
                  placeholder="חיפוש: פרויקט חדש, ספריה, הגדרות…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="text-[10px] font-mono bg-muted/40 px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                  ESC
                </kbd>
              </div>
              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="text-sm text-muted-foreground text-center py-8">
                  לא נמצאו תוצאות.
                </Command.Empty>
                {(['יצירה', 'ניווט', 'אדמין'] as const).map((group) => (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="text-[11px] uppercase tracking-widest text-muted-foreground px-2 pt-3 pb-1"
                  >
                    {ITEMS.filter((i) => i.group === group).map((item) => {
                      const Icon = item.icon;
                      return (
                        <Command.Item
                          key={item.href}
                          value={`${item.label} ${(item.keywords ?? []).join(' ')}`}
                          onSelect={() => go(item.href)}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm hover:bg-primary/10 aria-selected:bg-primary/15 aria-selected:ring-1 aria-selected:ring-primary/30"
                        >
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="flex-1">{item.label}</span>
                          {item.shortcut && (
                            <kbd className="text-[10px] font-mono bg-muted/40 px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                              {item.shortcut}
                            </kbd>
                          )}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
