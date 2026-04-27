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

// 1: product   2: avatar   3: scripts   4: scenes (images)   5: videos   6: finish
export function getCurrentStepNumber(project: ProjectStateForResume): number {
  const data = (project.productData as Record<string, unknown> | null) ?? {};

  if (!data.selectedAvatarId) return 2;
  if (!project.selectedScriptId) return 3;

  const selected = project.scripts?.find((s) => s.id === project.selectedScriptId);
  if (!selected) return 3; // selection cleared / scripts missing — back to scripts

  const allImagesDone = selected.scenes.length > 0 && selected.scenes.every((s) => !!s.imageUrl);
  if (!allImagesDone) return 4;

  // Steps 5+ aren't built yet; for now park completed-images projects on /videos.
  return 5;
}

const STEP_PATH: Record<number, string> = {
  2: 'avatar',
  3: 'scripts',
  4: 'scenes',
  5: 'videos',
  6: 'finish',
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
