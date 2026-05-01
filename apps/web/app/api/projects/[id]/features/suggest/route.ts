// POST /api/projects/[id]/features/suggest — V26.18.
//
// Extracts 3-4 STRONG selling features from the product intelligence
// dossier (description / brand / features text / scraped page content)
// using gpt-5.4-mini structured output. Caches the result onto
// `Project.productData.suggestedFeatures` so the wizard step doesn't
// re-spend on every refresh.
//
// Pre-V26.18 the script LLM saw the entire intelligence blob and
// tried to cover everything in each of the 6 framework calls →
// outputs felt enumerative ("industrial, non-human"). Forcing the
// user to pick 1-3 features upstream gives every script a sharp
// anchor to build around.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { openaiStructuredCall, OPENAI_DEFAULT_SCRIPT_MODEL } from '@/lib/llm/openai-script-client';
import {
  recordApiCallStart,
  recordApiCallComplete,
} from '@/lib/usage/log';
import { attributeOpenAiTextCost } from '@/lib/usage/cost-attribution';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { FEATURE_SUGGESTION_COUNT, type ProductFeature } from '@ugc-video/shared';

const SYSTEM_PROMPT = `אתה אסטרטג שיווקי ישראלי. מקבל מידע על מוצר וצריך לחלץ 3-4 תכונות מנצחות שעליהן כדאי לבנות מודעת UGC.

עקרונות:
- תכונה "מנצחת" = מה שיגרום ישראלי לעצור את הגלילה ולקנות. לא תכונה טכנית גנרית.
- כל תכונה: כותרת קצרה (2-5 מילים בעברית) + משפט אחד מדוע זה מוכר.
- העדף תכונות שניתן להראות ויזואלית (חיתוך נקי, גיבוי לאריזה אקולוגית, אחיזה ארגונומית) על פני תכונות מופשטות (איכות גבוהה, מקצועיות).
- הימנע מסופרלטיבים תרגומיים ("הטוב ביותר", "המהפכני"). העדף ניסוח ישראלי טבעי.
- אל תכלול את שם המותג כתכונה.
- 3 תכונות חזקות עדיף על 4 חלשות.

החזר JSON תקני עם המבנה: { "features": [{ "id": "slug-kebab-case", "title": "...", "hook": "..." }, ...] }`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    features: {
      type: 'array',
      minItems: 3,
      maxItems: FEATURE_SUGGESTION_COUNT,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'kebab-case slug, English chars only' },
          title: { type: 'string', description: 'Hebrew headline 2-5 words' },
          hook: { type: 'string', description: 'Hebrew sentence why it sells' },
        },
        required: ['id', 'title', 'hook'],
      },
    },
  },
  required: ['features'],
};

interface LlmResponse {
  features: Array<{ id: string; title: string; hook: string }>;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: dbUser.id },
    select: { id: true, productData: true, productName: true },
  });
  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
  }

  // Rate-limit reuse: feature suggestion is a small one-shot LLM call.
  // Bucket it under script_gen which already exists (6/600s).
  try {
    await checkRateLimit(dbUser.id, 'script_gen');
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }

  const data = (project.productData as Record<string, unknown> | null) ?? {};
  const description = typeof data.description === 'string' ? data.description : '';
  const brand = typeof data.brand === 'string' ? data.brand : '';
  const features = Array.isArray(data.features)
    ? (data.features as unknown[]).filter((x) => typeof x === 'string').join(' · ')
    : '';
  const targetAudience = typeof data.targetAudience === 'string' ? data.targetAudience : '';
  const category = typeof data.category === 'string' ? data.category : '';

  const userPrompt = [
    `שם המוצר: ${project.productName ?? '(לא ידוע)'}`,
    brand ? `מותג: ${brand}` : '',
    targetAudience ? `קהל יעד: ${targetAudience}` : '',
    category ? `קטגוריה: ${category}` : '',
    description ? `תיאור: ${description}` : '',
    features ? `תכונות מהדף: ${features}` : '',
    '',
    `החזר 3-4 תכונות מנצחות לסרטון UGC ב-9:16 לישראלים.`,
  ]
    .filter(Boolean)
    .join('\n');

  const model = process.env.OPENAI_SCRIPT_MODEL || OPENAI_DEFAULT_SCRIPT_MODEL;
  const startedAt = Date.now();
  const callId = await recordApiCallStart({
    provider: 'openai',
    operation: 'feature_suggest',
    model,
    userId: dbUser.id,
    projectId: project.id,
  });

  let parsed: LlmResponse;
  let usage: { inputTokens: number; outputTokens: number } = {
    inputTokens: 0,
    outputTokens: 0,
  };
  try {
    const result = await openaiStructuredCall<LlmResponse>({
      systemInstruction: SYSTEM_PROMPT,
      userPrompt,
      responseSchema: RESPONSE_SCHEMA,
      model,
    });
    parsed = result.parsed;
    usage = {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    };
  } catch (err) {
    await recordApiCallComplete(callId, {
      success: false,
      errorMessage: (err as Error).message,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: 'feature_suggest_failed', message: (err as Error).message },
      { status: 502 },
    );
  }

  const attribution = attributeOpenAiTextCost({
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  });
  await recordApiCallComplete(callId, {
    success: true,
    model,
    costUsd: attribution.costUsd,
    estimatedCostUsd: attribution.estimatedCostUsd,
    actualCostUsd: attribution.actualCostUsd,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    durationMs: Date.now() - startedAt,
    metadata: { ...attribution.metadata, source: attribution.source },
  });

  // Tag every feature as 'llm' so the UI knows where it came from.
  const suggested: ProductFeature[] = (parsed.features ?? []).map((f) => ({
    id: f.id || crypto.randomUUID(),
    title: f.title.trim(),
    hook: f.hook.trim(),
    source: 'llm' as const,
  }));

  // Cache on productData so a refresh doesn't re-spend.
  const merged = { ...data, suggestedFeatures: suggested };
  await prisma.project.update({
    where: { id: project.id },
    data: { productData: merged as object },
  });

  return NextResponse.json({ features: suggested });
}
