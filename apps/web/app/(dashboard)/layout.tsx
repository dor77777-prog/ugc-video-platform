import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Topbar } from '@/components/layout/topbar';
import { Sidebar } from '@/components/layout/sidebar';
import { CommandPalette } from '@/components/command-palette';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authUser, dbUser } = await getOrCreateAppUser();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Topbar email={authUser.email!} creditsBalance={dbUser.creditsBalance} role={dbUser.role} />
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 overflow-x-auto">{children}</main>
      </div>
      {/* V16 — global Cmd+K command palette. Lives at the layout level
          so the keyboard shortcut + floating "search" hint are
          available on every authenticated page. */}
      <CommandPalette />
    </div>
  );
}
