// GET /api/projects/[id]/scripts/list — lightweight polling endpoint for
// the scripts page. Returns the project's current scripts (with scenes
// + the rawJson blob the client needs for rendering creative_strategy
// / hook_options / quality_score) plus a `generating` flag.
//
// The flag is true while the count is below the expected total (6) AND
// the most-recent script was created in the last 3 minutes — gives the
// client a clean "stop polling" signal even if the action is still in
// flight when the user lands on the page.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';

const EXPECTED_SCRIPT_COUNT = 6;
const STILL_GENERATING_TTL_MS = 3 * 60 * 1000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const project = await prisma.project.findFirst({
    where: { id, userId: dbUser.id },
    include: {
      scripts: {
        orderBy: { createdAt: 'asc' },
        include: {
          scenes: { orderBy: { sceneOrder: 'asc' } },
        },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const latestCreatedAt = project.scripts.reduce<Date | null>((acc, s) => {
    if (!acc || s.createdAt > acc) return s.createdAt;
    return acc;
  }, null);
  const recentlyActive =
    latestCreatedAt != null &&
    Date.now() - latestCreatedAt.getTime() < STILL_GENERATING_TTL_MS;
  const generating =
    project.scripts.length > 0 &&
    project.scripts.length < EXPECTED_SCRIPT_COUNT &&
    recentlyActive;

  return NextResponse.json({
    scripts: project.scripts.map((s) => ({
      id: s.id,
      framework: s.framework,
      angle: s.angle,
      hook: s.hook,
      cta: s.cta,
      estimatedDurationSeconds: s.estimatedDurationSeconds,
      qualityScoreOverall: s.qualityScoreOverall,
      selectedHookReason: s.selectedHookReason,
      rawJson: s.rawJson,
      scenes: s.scenes.map((sc) => ({
        id: sc.id,
        sceneOrder: sc.sceneOrder,
        sceneGoal: sc.sceneGoal,
        textHebrew: sc.textHebrew,
        onScreenCaptionHebrew: sc.onScreenCaptionHebrew,
        cameraDirection: sc.cameraDirection,
        performanceNote: sc.performanceNote,
        durationSeconds: sc.durationSeconds,
      })),
    })),
    selectedScriptId: project.selectedScriptId,
    expectedCount: EXPECTED_SCRIPT_COUNT,
    generating,
  });
}
