import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { Topbar } from '@/components/layout/topbar';
import { Sidebar } from '@/components/layout/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { authUser, dbUser } = await getOrCreateAppUser();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Topbar email={authUser.email!} creditsBalance={dbUser.creditsBalance} />
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
