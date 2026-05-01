// Wizard navigation helpers. The whole wizard state lives in DB columns; this
// module reads that state and tells you (a) which numbered step a project is
// currently on and (b) what URL the user should be sent to to resume.

export interface ProjectStateForResume {
  id: string;
  selectedScriptId: string | null;
  productData: unknown;
  // Pass scripts when we have them — used to decide if scene images are done.
  scripts?: {
    id: string;
    scenes: { id: string; imageUrl: string | null }[];
  }[];
}

// V26.19 — 8 steps. 1: product   2: avatar   3: features   4: scripts
// 5: scenes (images)   6: voices   7: videos (clips + render)   8: finish
export function getCurrentStepNumber(project: ProjectStateForResume): number {
  const data = (project.productData as Record<string, unknown> | null) ?? {};

  if (!data.selectedAvatarId) return 2;
  // V26.18 — Feature Focus must have ≥1 selected before scripts.
  const selectedFeatures = Array.isArray((data as { selectedFeatures?: unknown[] }).selectedFeatures)
    ? (data as { selectedFeatures: unknown[] }).selectedFeatures
    : [];
  if (selectedFeatures.length === 0) return 3;
  if (!project.selectedScriptId) return 4;

  const selected = project.scripts?.find((s) => s.id === project.selectedScriptId);
  if (!selected) return 4; // selection cleared / scripts missing — back to scripts

  const allImagesDone = selected.scenes.length > 0 && selected.scenes.every((s) => !!s.imageUrl);
  if (!allImagesDone) return 5;

  // V26.19 — caller doesn't pass voiceUrl here (scenes select is
  // image-only). Once images are done we land the user on /voices; the
  // page itself decides whether to show the empty-voicing state or the
  // already-voiced state.
  return 6;
}

const STEP_PATH: Record<number, string> = {
  2: 'avatar',
  3: 'features',
  4: 'scripts',
  5: 'scenes',
  6: 'voices',
  7: 'videos',
  8: 'finish',
};

// Step 1 is /projects/new (a separate route, not under /projects/[id]).
// All other steps live under /projects/[id]/<path>.
export function getResumeUrl(project: ProjectStateForResume): string {
  const step = getCurrentStepNumber(project);
  if (step === 1) return '/projects/new';
  const path = STEP_PATH[step];
  return path ? `/projects/${project.id}/${path}` : `/projects/${project.id}/scripts`;
}

export function getStepHref(stepNum: number, projectId: string): string | undefined {
  if (stepNum === 1) return '/projects/new';
  const path = STEP_PATH[stepNum];
  return path ? `/projects/${projectId}/${path}` : undefined;
}
