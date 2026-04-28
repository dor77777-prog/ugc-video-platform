// POST /api/dev/kling-talking-bakeoff
//
// Run the same image + audio through every available Kling-family
// talking-scene method and return URLs for each result. Lets us pick
// the visually best path before committing one in production.
//
// Body: { imageUrl, audioUrl, baseVideoUrl?, methods? }
//   - imageUrl, audioUrl  — public URLs (Kling fetches them)
//   - baseVideoUrl        — optional. If present, we ALSO test
//                           lipsync_v1 directly on the supplied silent
//                           video (skips re-running i2v).
//   - methods (optional)  — array of method names. Default: all.
//
// Output: { results: [{ method, status, videoUrl?, modelUsed?,
//   durationMs, errorMessage? }] } — one row per method.
//
// Security: admin-only. Any caller can burn $$ here.

import { NextResponse } from 'next/server';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { getStorage } from '@/lib/storage';
import {
  ALL_TALKING_SCENE_PROVIDERS,
  getTalkingSceneProviderByName,
  type TalkingSceneProviderName,
} from '@/lib/animation/talking-scene';
import { klingLipSyncProvider } from '@/lib/animation/lipsync/kling';

interface BakeoffRequest {
  imageUrl?: string;
  audioUrl?: string;
  /** Optional: silent video URL for the literal lipsync_v1 path
   *  (bypasses the in-adapter i2v step). */
  baseVideoUrl?: string;
  methods?: string[];
  durationSeconds?: number;
}

interface BakeoffResult {
  method: string;
  status: 'completed' | 'failed';
  videoUrl?: string;
  modelUsed?: string;
  durationMs: number;
  errorMessage?: string;
}

const ALL_METHODS: TalkingSceneProviderName[] = [
  'ai_avatar_v2_pro',
  'ai_avatar_v2_standard',
  'advanced_lipsync',
  'lipsync_v1',
];

export async function POST(req: Request) {
  const { dbUser } = await getOrCreateAppUser();
  if (dbUser.role !== 'admin') {
    return NextResponse.json({ error: 'admin_only' }, { status: 403 });
  }

  let body: BakeoffRequest;
  try {
    body = (await req.json()) as BakeoffRequest;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { imageUrl, audioUrl, baseVideoUrl, durationSeconds = 5 } = body;
  if (!imageUrl || !audioUrl) {
    return NextResponse.json(
      { error: 'imageUrl and audioUrl are required (must be PUBLIC URLs)' },
      { status: 400 },
    );
  }

  // Default = run all methods. If user passes methods[], only run those.
  const requested = (
    body.methods && body.methods.length > 0 ? body.methods : ALL_METHODS
  )
    .map((m) => m.toLowerCase())
    .filter((m): m is TalkingSceneProviderName => (m as TalkingSceneProviderName) in ALL_TALKING_SCENE_PROVIDERS);

  if (requested.length === 0) {
    return NextResponse.json(
      {
        error: 'no_valid_methods',
        message: `Specify at least one of: ${Object.keys(ALL_TALKING_SCENE_PROVIDERS).join(', ')}`,
      },
      { status: 400 },
    );
  }

  const sceneId = `talkbake-${Date.now()}`;
  const storage = await getStorage();

  // Run all methods in parallel — they don't share resources, and the
  // user is here to SEE differences, not stage them.
  const results = await Promise.all(
    requested.map(async (name): Promise<BakeoffResult> => {
      const startedAt = Date.now();
      try {
        // Special-case: lipsync_v1 with a supplied baseVideoUrl bypasses
        // the adapter's internal i2v step and points lipsync directly at
        // the user's video. This lets the operator test the lipsync
        // model in isolation when they already have a silent take they
        // want to evaluate.
        if (name === 'lipsync_v1' && baseVideoUrl) {
          const out = await klingLipSyncProvider.generate({
            videoUrl: baseVideoUrl,
            audioUrl,
            durationSeconds,
            sceneId: `${sceneId}-${name}-direct`,
          });
          const filename = `${sceneId}-${name}-direct.mp4`;
          const saved = await storage.putBytes({
            folder: 'bakeoff/talking',
            filename,
            data: out.videoBytes,
            contentType: 'video/mp4',
          });
          return {
            method: `${name}_direct`,
            status: 'completed',
            videoUrl: saved.url,
            modelUsed: out.modelUsed,
            durationMs: Date.now() - startedAt,
          };
        }

        const provider = getTalkingSceneProviderByName(name);
        const out = await provider.generate({
          imageUrl,
          audioUrl,
          durationSeconds,
          sceneId: `${sceneId}-${name}`,
        });
        const filename = `${sceneId}-${name}.mp4`;
        const saved = await storage.putBytes({
          folder: 'bakeoff/talking',
          filename,
          data: out.videoBytes,
          contentType: 'video/mp4',
        });
        return {
          method: name,
          status: 'completed',
          videoUrl: saved.url,
          modelUsed: out.modelUsed,
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          method: name,
          status: 'failed',
          errorMessage: (err as Error).message,
          durationMs: Date.now() - startedAt,
        };
      }
    }),
  );

  return NextResponse.json({
    sceneId,
    inputs: { imageUrl, audioUrl, baseVideoUrl: baseVideoUrl ?? null, durationSeconds },
    methods: requested,
    results,
  });
}
