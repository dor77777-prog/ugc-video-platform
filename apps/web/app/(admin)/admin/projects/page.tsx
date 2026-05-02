import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const STATUS_VARIANTS = {
  draft: 'muted',
  product_extracted: 'outline',
  scripts_generated: 'outline',
  rendering: 'default',
  completed: 'success',
  failed: 'destructive',
  archived: 'muted',
} as const;

export default async function AdminProjectsPage() {
  const projects = await prisma.project.findMany({
    include: {
      user: true,
      _count: { select: { scripts: true, renderJobs: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-6">
      <div className="space-y-1">
        <div className="kicker-muted font-mono text-[10px] uppercase">Admin · Projects</div>
        <h1 className="text-3xl font-bold tracking-tight">פרויקטים</h1>
        <p className="text-sm text-muted-foreground">{projects.length} פרויקטים אחרונים</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מוצר</TableHead>
                <TableHead>בעלים</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>תסריטים</TableHead>
                <TableHead>רינדורים</TableHead>
                <TableHead>נוצר</TableHead>
                <TableHead>דיבאג</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.productName ?? '—'}</TableCell>
                  <TableCell dir="ltr" className="text-muted-foreground text-sm">{p.user.email}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[p.status] ?? 'outline'}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">{p._count.scripts}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{p._count.renderJobs}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.createdAt.toLocaleDateString('he-IL')}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/projects/${p.id}/debug`}
                      className="rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-blue-700 hover:bg-zinc-200"
                    >
                      debug →
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {projects.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    אין פרויקטים עדיין
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
