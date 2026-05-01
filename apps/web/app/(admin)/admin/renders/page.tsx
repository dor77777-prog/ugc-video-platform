import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RenderJobStatus } from '@prisma/client';
import { retryRenderAction, cancelRenderAction } from './actions';

export const dynamic = 'force-dynamic';

const ALL_STATUSES = [
  'all',
  'pending',
  'extracting_assets',
  'generating_voice',
  'generating_avatar_video',
  'generating_broll',
  'composing_video',
  'uploading_final',
  'completed',
  'failed',
  'cancelled',
] as const;

const STATUS_VARIANTS: Record<RenderJobStatus, 'default' | 'destructive' | 'success' | 'muted' | 'outline'> = {
  pending: 'outline',
  extracting_assets: 'outline',
  generating_voice: 'default',
  generating_avatar_video: 'default',
  generating_broll: 'default',
  composing_video: 'default',
  uploading_final: 'default',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'muted',
};

const FAILED_OR_RUNNING: RenderJobStatus[] = [
  RenderJobStatus.pending,
  RenderJobStatus.extracting_assets,
  RenderJobStatus.generating_voice,
  RenderJobStatus.generating_avatar_video,
  RenderJobStatus.generating_broll,
  RenderJobStatus.composing_video,
  RenderJobStatus.uploading_final,
];

export default async function AdminRendersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.status ?? 'all';

  const whereStatus =
    filter && filter !== 'all' && (ALL_STATUSES as readonly string[]).includes(filter)
      ? { status: filter as RenderJobStatus }
      : {};

  const jobs = await prisma.renderJob.findMany({
    where: whereStatus,
    include: { user: true, project: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl space-y-6">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin · Renders</div>
        <h1 className="text-3xl font-bold tracking-tight">ג׳ובי רינדור</h1>
        <p className="text-sm text-muted-foreground">{jobs.length} ג׳ובים אחרונים</p>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {ALL_STATUSES.map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '/admin/renders' : `/admin/renders?status=${s}`}
            className={
              filter === s
                ? 'px-3 py-1 rounded-md text-xs font-semibold bg-foreground text-background'
                : 'px-3 py-1 rounded-md text-xs bg-muted text-muted-foreground hover:bg-secondary'
            }
          >
            {s}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>נוצר</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>התקדמות</TableHead>
                <TableHead>משתמש</TableHead>
                <TableHead>מוצר</TableHead>
                <TableHead>שגיאה</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {j.createdAt.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[j.status] ?? 'outline'}>{j.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{j.progressPercent}%</TableCell>
                  <TableCell dir="ltr" className="text-sm text-muted-foreground">
                    {j.user.email}
                  </TableCell>
                  <TableCell className="text-sm">{j.project.productName ?? '—'}</TableCell>
                  <TableCell className="text-xs text-destructive max-w-xs truncate" dir="ltr" title={j.errorMessage ?? ''}>
                    {j.errorMessage ?? ''}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {j.status === RenderJobStatus.failed && (
                        <form action={retryRenderAction}>
                          <input type="hidden" name="renderJobId" value={j.id} />
                          <button className="text-xs px-2 py-1 rounded bg-ai/40 hover:bg-ai/70 transition-colors">
                            הרץ שוב
                          </button>
                        </form>
                      )}
                      {FAILED_OR_RUNNING.includes(j.status) && (
                        <form action={cancelRenderAction}>
                          <input type="hidden" name="renderJobId" value={j.id} />
                          <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted transition-colors">
                            בטל
                          </button>
                        </form>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    אין ג׳ובים תואמים
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
