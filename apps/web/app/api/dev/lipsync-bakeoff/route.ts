// POST /api/dev/lipsync-bakeoff
//
// Run the same silent video + audio through multiple LipSync providers
// in parallel and return URLs for each result. Lets us A/B Kling vs
// Sync.so vs ElevenLabs Omnihuman vs mock on identical inputs without
// running a full scene-generation pipeline.
//
// Body: { sceneVideoUrl, audioUrl, providers? }
//   - sceneVideoUrl, audioUrl  — public URLs (Kling/Sync fetch them)
//   - providers (optional)     — array of provider names to compare.
//                                Default = ["kling", "sync"].
//
// Output: { results: [{ provider, status, videoUrl?, errorMessage?,
//   durationMs }] } — one row per provider, results returned in order.
//
// Security: admin-only. We don't want public users burning provider
// budget by hitting this with arbitrary URLs.

import { NextResponse } from 'next/server';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { getStorage } from '@/lib/storage';
import {
  ALL_LIPSYNC_PROVIDERS,
  getLipSyncProviderByName,
  type LipSyncProviderName,
} from '@/lib/animation/lipsync';

interface BakeoffRequest {
  sceneVideoUrl?: string;
  audioUrl?: string;
  providers?: string[];
  durationSeconds?: number;
}

interface BakeoffResult {
  provider: string;
  status: 'completed' | 'failed';
  videoUrl?: string;
  modelUsed?: string;
  durationMs: number;
  errorMessage?: string;
}

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

  const { sceneVideoUrl, audioUrl, durationSeconds = 5 } = body;
  if (!sceneVideoUrl || !audioUrl) {
    return NextResponse.json(
      { error: 'sceneVideoUrl and audioUrl are required (must be PUBLIC URLs)' },
      { status: 400 },
    );
  }

  // Default to all real providers (skip mock unless explicitly asked).
  const requestedProviders = (
    body.providers && body.providers.length > 0
      ? body.providers
      : (['kling', 'sync'] as LipSyncProviderName[])
  )
    .map((p) => p.toLowerCase())
    .filter((p): p is LipSyncProviderName => p in ALL_LIPSYNC_PROVIDERS);

  if (requestedProviders.length === 0) {
    return NextResponse.json(
      {
        error: 'no_valid_providers',
        message: `Specify at least one of: ${Object.keys(ALL_LIPSYNC_PROVIDERS).join(', ')}`,
      },
      { status: 400 },
    );
  }

  const sceneId = `bakeoff-${Date.now()}`;
  const storage = await getStorage();

  // Run providers in parallel — they don't share resources.
  const results = await Promise.all(
    requestedProviders.map(async (name): Promise<BakeoffResult> => {
      const provider = getLipSyncProviderByName(name);
      const startedAt = Date.now();
      try {
        const out = await provider.generate({
          videoUrl: sceneVideoUrl,
          audioUrl,
          durationSeconds,
          sceneId: `${sceneId}-${name}`,
        });
        // Persist a local copy so the user can pull the file from a
        // stable URL even after the provider's CDN expires the result.
        const filename = `${sceneId}-${name}.mp4`;
        const saved = await storage.putBytes({
          folder: 'bakeoff',
          filename,
          data: out.videoBytes,
          contentType: 'video/mp4',
        });
        return {
          provider: name,
          status: 'completed',
          videoUrl: saved.url,
          modelUsed: out.modelUsed,
          durationMs: Date.now() - startedAt,
        };
      } catch (err) {
        return {
          provider: name,
          status: 'failed',
          errorMessage: (err as Error).message,
          durationMs: Date.now() - startedAt,
        };
      }
    }),
  );

  return NextResponse.json({
    sceneId,
    inputs: { sceneVideoUrl, audioUrl, durationSeconds },
    providers: requestedProviders,
    results,
  });
}
