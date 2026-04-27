import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function AdminCostsPage() {
  const totalCosts = await prisma.renderJob.aggregate({
    _sum: { actualCostUsd: true, estimatedCostUsd: true },
    _count: { _all: true },
  });

  const recent = await prisma.renderJob.findMany({
    where: {
      OR: [
        { actualCostUsd: { not: null } },
        { estimatedCostUsd: { not: null } },
      ],
    },
    include: { user: true, project: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const totalActual = totalCosts._sum.actualCostUsd ?? 0;
  const totalEstimated = totalCosts._sum.estimatedCostUsd ?? 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin · Costs</div>
        <h1 className="text-3xl font-bold tracking-tight">עלויות</h1>
        <p className="text-sm text-muted-foreground">
          כרגע כל הספקים הם mocks. כשנחבר ElevenLabs / HeyGen / Kling / Creatomate — נכתוב את העלות בפועל
          (estimated_cost_usd / actual_cost_usd) על כל RenderJob, וכאן יוצג הפירוק האמיתי.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="עלות בפועל מצטברת" value={formatUSD(totalActual)} />
        <KpiCard label="הערכה מצטברת" value={formatUSD(totalEstimated)} />
        <KpiCard label="ג׳ובים בכלל" value={String(totalCosts._count._all)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ג׳וב</TableHead>
                <TableHead>משתמש</TableHead>
                <TableHead>מוצר</TableHead>
                <TableHead>הערכה</TableHead>
                <TableHead>בפועל</TableHead>
                <TableHead>נוצר</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    אין נתוני עלות עדיין — יוקצה ב־RenderJob.actualCostUsd כשהספקים האמיתיים מחוברים.
                  </TableCell>
                </TableRow>
              ) : (
                recent.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-mono text-xs">{j.id.slice(0, 12)}</TableCell>
                    <TableCell dir="ltr" className="text-sm">{j.user.email}</TableCell>
                    <TableCell className="text-sm">{j.project.productName ?? '—'}</TableCell>
                    <TableCell className="font-mono">{formatUSD(j.estimatedCostUsd)}</TableCell>
                    <TableCell className="font-mono">{formatUSD(j.actualCostUsd)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j.createdAt.toLocaleDateString('he-IL')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-3xl font-bold mt-1 font-mono">{value}</div>
      </CardContent>
    </Card>
  );
}

function formatUSD(v?: number | null): string {
  if (v == null) return '—';
  return `$${v.toFixed(2)}`;
}
