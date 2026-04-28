// POST /api/scenes/[id]/generate — Route Handler that runs scene-image
// generation. Used by the "Generate all" loop on the scenes page.
//
// Why a Route Handler instead of the existing server action: Next.js App
// Router serializes server actions per-route, so Promise.all over server
// actions of the same page does NOT actually run them in parallel. Route
// Handlers don't have that limitation — multiple POSTs can execute
// concurrently. This is the difference between "5 scenes in 5 minutes"
// (sequential) and "5 scenes in ~2.5 minutes" (parallelism=2).

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { generateSceneImageImpl } from '@/lib/scenes/generate-impl';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { dbUser } = await getOrCreateAppUser();

  const result = await generateSceneImageImpl(id, dbUser.id);

  if (result.success && result.imageUrl) {
    // Trigger a route revalidation so a subsequent server-render of the
    // scenes page sees the new imageUrl. The client also polls the GET
    // endpoint independently, so the live UI doesn't depend on this.
    try {
      const sceneId = id;
      // Best effort — the client will refresh on its own anyway.
      revalidatePath(`/projects/${sceneId}/scenes`);
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json(result, { status: result.success ? 200 : 200 });
}
