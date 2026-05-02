// V27.11 — Browse-all-ApiCalls page. Filterable list with quick
// drill-down into per-call detail.

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  StatusPill,
  fmtDuration,
  fmtUSD,
  fmtRelative,
} from '@/components/admin/debug-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams {
  searchParams: Promise<{
    provider?: string;
    operation?: string;
    status?: string;
    from?: string;
    to?: string;
    take?: string;
  }>;
}

const PROVIDER_OPTIONS = [
  '',
  'openai',
  'anthropic',
  'gemini',
  'elevenlabs',
  'kling',
  'pixverse',
  'xai',
  'ffmpeg',
];

const STATUS_OPTIONS = ['', 'success', 'failed', 'in_progress'];

export default async function AdminApiCallsListPage({
  searchParams,
}: SearchParams) {
  const sp = await searchParams;
  const provider = sp.provider?.trim() || undefined;
  const operation = sp.operation?.trim() || undefined;
  const status = sp.status?.trim() || undefined;
  const fromStr = sp.from?.trim() || undefined;
  const toStr = sp.to?.trim() || undefined;
  const take = Math.min(Math.max(parseInt(sp.take ?? '100', 10) || 100, 10), 500);

  const from = fromStr ? new Date(fromStr) : undefined;
  const to = toStr ? new Date(toStr) : undefined;

  const where: Record<string, unknown> = {};
  if (provider) where.provider = provider;
  if (operation) where.operation = operation;
  if (status) where.status = status;
  if (from || to) {
    const range: Record<string, unknown> = {};
    if (from && !Number.isNaN(from.getTime())) range.gte = from;
    if (to && !Number.isNaN(to.getTime())) range.lte = to;
    if (Object.keys(range).length > 0) where.createdAt = range;
  }

  const calls = await prisma.apiCall.findMany({
    where: where as Record<string, never>,
    orderBy: { createdAt: 'desc' },
    take,
  });

  // Distinct operations for the filter dropdown
  const distinctOps = await prisma.apiCall.findMany({
    select: { operation: true },
    distinct: ['operation'],
    orderBy: { operation: 'asc' },
  });

  const totalCost = calls.reduce((acc, c) => acc + (c.costUsd ?? 0), 0);

  return (
    <div dir="rtl" className="container mx-auto space-y-6 p-6 max-w-7xl">
      <div className="space-y-1">
        <div className="kicker-muted font-mono text-[10px] uppercase">Admin · API Calls</div>
        <h1 className="text-3xl font-bold tracking-tight">קריאות API</h1>
        <p className="text-sm text-muted-foreground">
          כל הקריאות החיצוניות שיצאו מהמערכת — לחיצה על שורה פותחת dive מלא לתוך ה-payload.
        </p>
      </div>

      {/* Filters + export */}
      <Card className="tier-surface">
        <CardContent className="p-4 space-y-3">
          <form className="flex flex-wrap items-end gap-3 text-sm" method="GET">
            <label className="space-y-1">
              <div className="kicker-muted font-mono text-[10px] uppercase">Provider</div>
              <select
                name="provider"
                defaultValue={provider ?? ''}
                className="rounded border px-2 py-1 font-mono text-xs"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p || '(הכול)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="kicker-muted font-mono text-[10px] uppercase">Operation</div>
              <select
                name="operation"
                defaultValue={operation ?? ''}
                className="rounded border px-2 py-1 font-mono text-xs"
              >
                <option value="">(הכול)</option>
                {distinctOps.map((op) => (
                  <option key={op.operation} value={op.operation}>
                    {op.operation}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="kicker-muted font-mono text-[10px] uppercase">Status</div>
              <select
                name="status"
                defaultValue={status ?? ''}
                className="rounded border px-2 py-1 font-mono text-xs"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s || '(הכול)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <div className="kicker-muted font-mono text-[10px] uppercase">From (UTC)</div>
              <input
                type="datetime-local"
                name="from"
                defaultValue={fromStr ? fromStr.replace('Z', '').slice(0, 16) : ''}
                className="rounded border px-2 py-1 font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <div className="kicker-muted font-mono text-[10px] uppercase">To (UTC)</div>
              <input
                type="datetime-local"
                name="to"
                defaultValue={toStr ? toStr.replace('Z', '').slice(0, 16) : ''}
                className="rounded border px-2 py-1 font-mono text-xs"
              />
            </label>
            <label className="space-y-1">
              <div className="kicker-muted font-mono text-[10px] uppercase">Take</div>
              <input
                type="number"
                name="take"
                defaultValue={take}
                min={10}
                max={500}
                className="w-20 rounded border px-2 py-1 font-mono text-xs"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90"
            >
              סנן
            </button>
            <span className="text-xs text-muted-foreground">
              {calls.length} שורות · {fmtUSD(totalCost)}
            </span>
          </form>
          {/* V27.11 — Export current filtered view as Markdown.
              The export endpoint accepts the same query params; we
              rebuild them here so the user gets exactly what they
              see in the table. take is bumped to up to 2000 in the
              export route. */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
            <span className="kicker-muted font-mono text-[10px] uppercase">דוח</span>
            <a
              href={`/api/admin/apicalls/export?${new URLSearchParams({
                ...(provider ? { provider } : {}),
                ...(operation ? { operation } : {}),
                ...(status ? { status } : {}),
                ...(fromStr ? { from: fromStr } : {}),
                ...(toStr ? { to: toStr } : {}),
                take: '2000',
              }).toString()}`}
              className="rounded border border-blue-300 bg-blue-50 px-2 py-1 font-mono text-blue-700 hover:bg-blue-100"
              download
            >
              📥 ייצוא Markdown לכל הקריאות לפי הפילטרים
            </a>
            <span className="text-muted-foreground">
              דוח Markdown מלא — מכיל env snapshot, aggregate stats, פירוט כשלים, וטבלת פירוט. קריא ל־Claude Code / כלי AI אחרים לדיבאג.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Results table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-right">When</th>
                  <th className="px-3 py-2 text-right">Provider</th>
                  <th className="px-3 py-2 text-right">Operation</th>
                  <th className="px-3 py-2 text-right">Status</th>
                  <th className="px-3 py-2 text-right">Model</th>
                  <th className="px-3 py-2 text-right">Tokens (in/out)</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                  <th className="px-3 py-2 text-right">Project</th>
                  <th className="px-3 py-2 text-right">Detail</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-zinc-50">
                    <td className="px-3 py-2 text-zinc-500">{fmtRelative(c.createdAt)}</td>
                    <td className="px-3 py-2 font-mono">
                      <Badge variant="outline">{c.provider}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono">{c.operation}</td>
                    <td className="px-3 py-2">
                      <StatusPill
                        variant={
                          c.status === 'success'
                            ? 'success'
                            : c.status === 'failed'
                              ? 'error'
                              : 'pending'
                        }
                      >
                        {c.status}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-2 font-mono text-zinc-600">
                      {c.model ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {c.inputTokens != null && c.outputTokens != null
                        ? `${c.inputTokens.toLocaleString()} / ${c.outputTokens.toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtUSD(c.costUsd)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtDuration(c.durationMs)}</td>
                    <td className="px-3 py-2 text-right">
                      {c.projectId ? (
                        <Link
                          href={`/admin/projects/${c.projectId}/debug`}
                          className="font-mono text-blue-700 hover:underline"
                        >
                          {c.projectId.slice(0, 6)}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/apicalls/${c.id}`}
                        className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-blue-700 hover:bg-zinc-200"
                      >
                        →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
