// Scene status state machine — V13 PR6.
//
// Per house style (.claude/CLAUDE.md), Prisma enums are avoided for
// values that might evolve. Instead, the `Scene.status` column is
// a `String?` and the canonical set lives here as a const tuple +
// derived TypeScript type + runtime guard. New states are added by
// editing this file alone; the DB never needs a migration to learn
// about them.
//
// State machine (V13 §14.1):
//
//   pending
//     ↓
//   planning  ────►  brief_built  ────►  generating_image  ────►  image_ready
//                                                                        ↓
//                                                              generating_voice
//                                                                        ↓
//                                                                   voice_ready
//                                                                        ↓
//                                                              generating_clip
//                                                                        ↓
//                                                                    clip_ready
//
//   ANY ──► failed         (transient or terminal — wizard surfaces retry)
//   ANY ──► needs_review   (human-flagged or hard-gen failure — manual action)

export const SCENE_STATUSES = [
  'pending',
  'planning',
  'brief_built',
  'generating_image',
  'image_ready',
  'generating_voice',
  'voice_ready',
  'generating_clip',
  'clip_ready',
  'needs_review',
  'failed',
] as const;

export type SceneStatus = (typeof SCENE_STATUSES)[number];

/** Type guard — narrows a string to SceneStatus when valid. */
export function isSceneStatus(value: unknown): value is SceneStatus {
  return (
    typeof value === 'string' &&
    (SCENE_STATUSES as readonly string[]).includes(value)
  );
}

/** Default for new Scene rows. Mirrors `@default("pending")` in
 *  prisma/schema.prisma so callers that bypass Prisma still agree. */
export const SCENE_STATUS_DEFAULT: SceneStatus = 'pending';

/** Terminal states — wizard renders a final outcome and stops polling. */
export const SCENE_STATUS_TERMINAL: ReadonlySet<SceneStatus> = new Set([
  'clip_ready',
  'failed',
  'needs_review',
] as const);

/** In-flight states — wizard renders a spinner + stage label. */
export const SCENE_STATUS_IN_FLIGHT: ReadonlySet<SceneStatus> = new Set([
  'planning',
  'generating_image',
  'generating_voice',
  'generating_clip',
] as const);

export function isTerminalSceneStatus(s: SceneStatus): boolean {
  return SCENE_STATUS_TERMINAL.has(s);
}

export function isInFlightSceneStatus(s: SceneStatus): boolean {
  return SCENE_STATUS_IN_FLIGHT.has(s);
}
