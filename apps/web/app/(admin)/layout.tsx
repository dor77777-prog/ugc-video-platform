import { requireAdmin } from '@/lib/auth/sync-user';
import { Topbar } from '@/components/layout/topbar';
import { AdminSidebar } from '@/components/layout/admin-sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { authUser, dbUser } = await requireAdmin();

  // V27 Wave 2: every admin surface declares dense (Vercel-mode) at the
  // layout level. Children that need a different density override
  // downward (per V27 inheritance rule, downward-only).
  return (
    <div data-density="dense" className="min-h-screen flex flex-col bg-background">
      <Topbar email={authUser.email!} creditsBalance={dbUser.creditsBalance} role={dbUser.role} />
      <div className="flex-1 flex">
        <AdminSidebar />
        <main className="flex-1 overflow-x-auto">{children}</main>
      </div>
    </div>
  );
}
