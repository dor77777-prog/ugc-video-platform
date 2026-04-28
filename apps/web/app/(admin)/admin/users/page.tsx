import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  addCreditsAction,
  toggleBanAction,
  refundCreditsAction,
  setSpendCapAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    include: {
      _count: { select: { projects: true, renderJobs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Summarize today's spend per user so the row shows it next to the cap.
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const todaySpend = await prisma.apiCall.groupBy({
    by: ['userId'],
    where: { success: true, createdAt: { gte: start }, userId: { not: null } },
    _sum: { costUsd: true },
  });
  const spendByUser = new Map(
    todaySpend.map((r) => [r.userId!, r._sum.costUsd ?? 0]),
  );

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
                <TableHead>היום ($)</TableHead>
                <TableHead>תקרה יומית</TableHead>
                <TableHead>פרויקטים</TableHead>
                <TableHead>רינדורים</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const spent = spendByUser.get(u.id) ?? 0;
                const cap = u.spendCapUsd ?? null;
                const overCap = cap != null && spent >= cap;
                return (
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
                    <TableCell
                      className={`font-mono ${overCap ? 'text-destructive font-bold' : 'text-muted-foreground'}`}
                      title={overCap ? 'חרג מהתקרה היומית' : undefined}
                    >
                      ${spent.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <form action={setSpendCapAction} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          type="text"
                          name="spendCapUsd"
                          defaultValue={cap != null ? String(cap) : ''}
                          placeholder="default"
                          className="w-16 text-xs font-mono border border-border rounded px-1.5 py-0.5 bg-card"
                          title="$/יום. ריק = ברירת מחדל ($10)"
                        />
                        <button
                          type="submit"
                          className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted"
                        >
                          ✓
                        </button>
                      </form>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">{u._count.projects}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{u._count.renderJobs}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <form action={addCreditsAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="amount" value="10" />
                          <button
                            type="submit"
                            className="text-xs px-2 py-1 rounded bg-accent/30 hover:bg-accent/60 transition-colors"
                            title="הענקה (+10)"
                          >
                            +10
                          </button>
                        </form>
                        <form action={refundCreditsAction} className="flex items-center gap-1">
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            type="number"
                            name="amount"
                            defaultValue="1"
                            min="1"
                            className="w-10 text-xs font-mono border border-border rounded px-1 py-0.5 bg-card"
                            title="כמות החזר"
                          />
                          <input
                            type="text"
                            name="note"
                            placeholder="סיבה"
                            className="w-20 text-xs border border-border rounded px-1 py-0.5 bg-card"
                            title="הערה (תופיע בלוג)"
                          />
                          <button
                            type="submit"
                            className="text-xs px-2 py-1 rounded bg-blue-500/20 hover:bg-blue-500/40 transition-colors"
                            title="החזר קרדיטים (refund)"
                          >
                            ↺
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
