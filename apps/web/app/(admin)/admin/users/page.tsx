import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { addCreditsAction, toggleBanAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    include: {
      _count: { select: { projects: true, renderJobs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin · Users</div>
        <h1 className="text-3xl font-bold tracking-tight">משתמשים</h1>
        <p className="text-sm text-muted-foreground">{users.length} משתמשים סך הכל</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>אימייל</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead>פלאן</TableHead>
                <TableHead>קרדיטים</TableHead>
                <TableHead>פרויקטים</TableHead>
                <TableHead>רינדורים</TableHead>
                <TableHead>הצטרפות</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium" dir="ltr">
                    {u.email}
                    {u.banned && <Badge variant="destructive" className="ms-2">חסום</Badge>}
                  </TableCell>
                  <TableCell>
                    {u.role === 'admin' ? (
                      <Badge variant="default">admin</Badge>
                    ) : (
                      <Badge variant="muted">user</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{u.plan}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{u.creditsBalance}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{u._count.projects}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{u._count.renderJobs}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.createdAt.toLocaleDateString('he-IL')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <form action={addCreditsAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="amount" value="10" />
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 rounded bg-accent/30 hover:bg-accent/60 transition-colors"
                          title="הוסף 10 קרדיטים"
                        >
                          +10
                        </button>
                      </form>
                      <form action={toggleBanAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors"
                        >
                          {u.banned ? 'בטל חסימה' : 'חסום'}
                        </button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
