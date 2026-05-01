// POST /api/products/upload-image — upload a product reference image.
//
// V26.17 — replaces the old URL-only inputs in the new-project wizard.
// Accepts multipart/form-data with a single `file` field, validates
// MIME + size, uploads to R2 (or local /uploads in dev), returns the
// public URL the client stores in productData.heroImageUrl /
// additionalImages exactly the same way it stored a scraped URL.
//
// Auth: requires an authenticated user. Per-user image_gen rate limit
// applies — keeps the endpoint from being weaponized as a free file
// host.

import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateAppUser } from '@/lib/auth/sync-user';
import { getStorage } from '@/lib/storage';
import { checkRateLimit, RateLimitedError } from '@/lib/usage/rate-limit';
import { recordApiCall } from '@/lib/usage/log';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB per image

function extFromMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'bin';
}

export async function POST(req: NextRequest) {
  const { dbUser } = await getOrCreateAppUser();

  // Per-user rate limit so a logged-in attacker can't free-host gigabytes
  // of files. Reuses the image_gen limit (20 / 60s) which is in the same
  // ballpark for legitimate wizard usage.
  try {
    await checkRateLimit(dbUser.id, 'image_gen');
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return NextResponse.json(
        { error: err.message },
        { status: 429 },
      );
    }
    throw err;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_multipart', message: (err as Error).message },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'missing_file', message: 'expected multipart field `file`' },
      { status: 400 },
    );
  }

  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json(
      {
        error: 'unsupported_mime',
        message: `סוג קובץ לא נתמך: ${file.type || 'unknown'}. רק JPEG / PNG / WebP / GIF.`,
      },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: 'too_large',
        message: `הקובץ גדול מדי (${Math.round(file.size / 1024 / 1024)}MB). עד 10MB לתמונה.`,
      },
      { status: 413 },
    );
  }

  const ab = await file.arrayBuffer();
  const data = new Uint8Array(ab);
  const ext = extFromMime(file.type);
  const filename = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const storage = await getStorage();
  const { url } = await storage.putBytes({
    folder: `product-uploads/${dbUser.id}`,
    filename,
    data,
    contentType: file.type,
  });

  // Best-effort cost log for visibility — storage write is ~$0.
  await recordApiCall({
    provider: 'r2',
    operation: 'product_image_upload',
    model: 'r2-storage',
    costUsd: 0,
    success: true,
    userId: dbUser.id,
    metadata: { sizeBytes: file.size, mime: file.type, filename },
  }).catch(() => {/* non-fatal */});

  return NextResponse.json({ url, sizeBytes: file.size, mime: file.type });
}
