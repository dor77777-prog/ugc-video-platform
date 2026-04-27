import { requireAdmin } from '@/lib/auth/sync-user';
import { Topbar } from '@/components/layout/topbar';
import { AdminSidebar } from '@/components/layout/admin-sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { authUser, dbUser } = await requireAdmin();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Topbar email={authUser.email!} creditsBalance={dbUser.creditsBalance} role={dbUser.role} />
      <div className="flex-1 flex">
        <AdminSidebar />
        <main className="flex-1 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
