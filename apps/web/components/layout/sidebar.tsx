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
} from 'lucide-react';
import { cn } from '@/lib/utils';

// V16 — sidebar refresh: Lucide icons, glass surface, primary-tinted
// active state with subtle glow on the live route. Layout structure
// unchanged so existing dashboard pages keep working.

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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-l border-border-subtle bg-card/40 backdrop-blur-md flex flex-col">
      <nav className="flex-1 p-4 space-y-1">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-3">
          תפריט
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}

        <div className="pt-6 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-3">
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
            <div className="text-sm font-semibold">שדרג את התוכנית</div>
          </div>
          <div className="text-xs opacity-90">
            יותר קרדיטים, יותר lipsync, יצוא MP4 מלא.
          </div>
          <div className="w-full mt-2 bg-accent text-accent-foreground text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5">
            ראה תוכניות
            <ArrowLeft className="h-3.5 w-3.5" />
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
