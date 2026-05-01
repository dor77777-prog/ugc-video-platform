import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { prisma } from '@/lib/db';
import { Topbar } from '@/components/layout/topbar';
import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { CommandPalette } from '@/components/command-palette';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authUser, dbUser } = await getOrCreateAppUser();

  const recentProjects = await prisma.project.findMany({
    where: { userId: dbUser.id, status: { not: 'archived' } },
    select: { id: true, productName: true, status: true },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });
  const recentProjectsForNav = recentProjects.map((p) => ({
    id: p.id,
    name: p.productName ?? 'פרויקט',
    isCompleted: p.status === 'completed',
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Topbar
        email={authUser.email!}
        creditsBalance={dbUser.creditsBalance}
        role={dbUser.role}
        mobileNav={<MobileNav recentProjects={recentProjectsForNav} />}
      />
      <div className="flex-1 flex">
        <Sidebar recentProjects={recentProjectsForNav} />
        <main className="flex-1 overflow-x-auto">{children}</main>
      </div>
      {/* V16 — global Cmd+K command palette. */}
      <CommandPalette />
    </div>
  );
}
