// V27.10.5 / V27.10.5b — TEMPORARY admin diagnostic.
//
// V27.10.5 confirmed:
//   - process.env.ANTHROPIC_API_KEY is present at runtime (108 chars,
//     sk-ant-a…zgAA, appearsValid: true)
//   - A simple Anthropic call with only model/max_tokens/messages
//     succeeds in <1s
//
// V27.10.5b adds: replicate the EXACT call shape that
// `anthropicStructuredCall` uses (system block with cache_control,
// max_tokens=8192, thinking:disabled, output_config.effort=low,
// schema appended to system) so we surface whatever error the
// production script-gen path is hitting.

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdminApi } from '@/lib/auth/admin-api';
import { anthropicStructuredCall, ANTHROPIC_DEFAULT_SCRIPT_MODEL } from '@/lib/llm/anthropic-script-client';
import { SINGLE_SCRIPT_JSON_SCHEMA } from '@ugc-video/prompts';
import { SCRIPT_SYSTEM_PROMPT } from '@ugc-video/prompts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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
    appearsValid: trimmed.length >= 20 && trimmed.startsWith('sk-ant-'),
  };

  if (!envInfo.appearsValid) {
    return NextResponse.json({
      env: envInfo,
      simpleCall: { skipped: 'key fails local validation' },
      scriptGenCall: { skipped: 'key fails local validation' },
    });
  }

  // Test 1: simple call (already confirmed working in V27.10.5).
  const simpleStart = Date.now();
  let simpleCall: Record<string, unknown>;
  try {
    const c = new Anthropic({ apiKey: trimmed });
    const res = await c.messages.create({
      model: ANTHROPIC_DEFAULT_SCRIPT_MODEL,
      max_tokens: 30,
      messages: [{ role: 'user', content: 'ping' }],
    });
    const txt = res.content.find((b) => b.type === 'text');
    simpleCall = {
      success: true,
      durationMs: Date.now() - simpleStart,
      model: ANTHROPIC_DEFAULT_SCRIPT_MODEL,
      snippet: txt && 'text' in txt ? txt.text.slice(0, 60) : '<no text>',
    };
  } catch (err) {
    const e = err as { message?: string; status?: number; error?: { type?: string } };
    simpleCall = {
      success: false,
      durationMs: Date.now() - simpleStart,
      errorMessage: e.message ?? String(err),
      errorStatus: e.status,
      errorType: e.error?.type,
    };
  }

  // Test 2: replicate the SCRIPT-GEN call shape — full SCRIPT_SYSTEM_PROMPT
  // + SINGLE_SCRIPT_JSON_SCHEMA + cache_control + max_tokens 8192 +
  // thinking:disabled + effort:low. Same wrapper that scripts.ts uses.
  const scriptGenStart = Date.now();
  let scriptGenCall: Record<string, unknown>;
  try {
    const minimalUser = `Generate a SINGLE script object for framework=problem_agitation_solution. Product: smartphone protective case. Target audience: Israeli mothers 30-45. Mode: 15s. Avatar gender: female.`;
    const result = await anthropicStructuredCall<unknown>({
      systemInstruction: SCRIPT_SYSTEM_PROMPT,
      userPrompt: minimalUser,
      responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
      model: ANTHROPIC_DEFAULT_SCRIPT_MODEL,
      maxTokens: 4096, // smaller than prod's 8192 so the diag returns faster
    });
    scriptGenCall = {
      success: true,
      durationMs: Date.now() - scriptGenStart,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadInputTokens: result.usage.cacheReadInputTokens,
      cacheCreationInputTokens: result.usage.cacheCreationInputTokens,
      rawSnippet: result.raw.slice(0, 200),
    };
  } catch (err) {
    const e = err as {
      message?: string;
      status?: number;
      error?: { type?: string; message?: string };
      headers?: Record<string, string>;
    };
    scriptGenCall = {
      success: false,
      durationMs: Date.now() - scriptGenStart,
      errorMessage: e.message ?? String(err),
      errorStatus: e.status,
      errorType: e.error?.type,
      anthropicErrorMessage: e.error?.message,
      stack: (err as Error).stack?.split('\n').slice(0, 6).join('\n'),
    };
  }

  return NextResponse.json({ env: envInfo, simpleCall, scriptGenCall });
}
