// V27.10.5 — TEMPORARY admin diagnostic.
//
// Reports the runtime state of process.env.ANTHROPIC_API_KEY without
// exposing the value, then tries a single live Anthropic API call
// with the current configuration and reports whatever error
// Anthropic returns. Behind requireAdminApi.
//
// Remove this route AFTER the live diagnosis is done.

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdminApi } from '@/lib/auth/admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const raw = process.env.ANTHROPIC_API_KEY;
  const trimmed = raw?.trim().replace(/^"+|"+$/g, '') ?? '';

  const envInfo = {
    rawIsUndefined: raw === undefined,
    rawLength: raw?.length ?? 0,
    trimmedLength: trimmed.length,
    startsWithSkAnt: trimmed.startsWith('sk-ant-'),
    prefix8: trimmed.length > 0 ? `${trimmed.slice(0, 8)}…` : '<empty>',
    suffix4: trimmed.length > 4 ? `…${trimmed.slice(-4)}` : '<short>',
    appearsValid: trimmed.length >= 20 && trimmed.startsWith('sk-ant-'),
  };

  // If we can already see the key is bad locally, skip the live call.
  if (!envInfo.appearsValid) {
    return NextResponse.json({
      env: envInfo,
      liveCall: { skipped: 'key fails local validation — would be config error' },
    });
  }

  // Try one minimal live call against haiku-4-5-20251001.
  const client = new Anthropic({ apiKey: trimmed });
  const liveCall: {
    model: string;
    success: boolean;
    durationMs: number;
    errorMessage?: string;
    errorStatus?: number;
    errorType?: string;
    responseTextSnippet?: string;
  } = {
    model: 'claude-haiku-4-5-20251001',
    success: false,
    durationMs: 0,
  };
  const startedAt = Date.now();
  try {
    const res = await client.messages.create({
      model: liveCall.model,
      max_tokens: 30,
      messages: [{ role: 'user', content: 'ping' }],
    });
    liveCall.durationMs = Date.now() - startedAt;
    liveCall.success = true;
    const firstText = res.content.find((b) => b.type === 'text');
    liveCall.responseTextSnippet =
      firstText && 'text' in firstText ? firstText.text.slice(0, 80) : '<no text>';
  } catch (err) {
    liveCall.durationMs = Date.now() - startedAt;
    const e = err as { message?: string; status?: number; error?: { type?: string } };
    liveCall.errorMessage = e.message ?? String(err);
    liveCall.errorStatus = e.status;
    liveCall.errorType = e.error?.type;
  }

  return NextResponse.json({ env: envInfo, liveCall });
}
