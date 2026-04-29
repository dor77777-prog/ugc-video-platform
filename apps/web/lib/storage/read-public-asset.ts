// Read an app-relative public asset (avatar, voice sample, music track,
// scene image saved under /uploads/) as bytes.
//
// Why this exists: in local dev, every consumer of `/avatars/eran.png`
// just did `fs.readFile(process.cwd() + '/public/avatars/eran.png')`.
// On Vercel that fails — the deploy excludes `public/` from the
// serverless function bundle to keep cold-start fast (see
// next.config.js + commit `7aac7bc`). The files ARE still served by
// Vercel's CDN at the same path; we just have to fetch them over
// HTTP instead of read from disk.
//
// Strategy:
//   1. Try disk read (works locally).
//   2. On ENOENT (file not in the bundle — production), fall back to
//      HTTP fetch from PUBLIC_BASE_URL + url.
//
// Loading order for the base URL:
//   PUBLIC_BASE_URL   (set in Vercel env, points to the production Vercel domain)
//   NEXT_PUBLIC_APP_URL (used in dev, defaults to http://localhost:3000)
//   VERCEL_URL        (auto-set by Vercel on every deploy — fallback)
//
// The helper returns both bytes + a guessed content-type so callers
// can pass it straight to `toFile()` (OpenAI SDK) or build a data URL
// for vision-model image_url params.

import { promises as fs } from 'fs';
import path from 'path';

export interface PublicAsset {
  bytes: Buffer;
  contentType: string;
}

export async function readPublicAsset(urlOrPath: string): Promise<PublicAsset> {
  // Absolute URL — fetch directly. (Caller-provided remote images.)
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return await fetchAsBuffer(urlOrPath);
  }

  // Data URL — already in-memory.
  if (urlOrPath.startsWith('data:')) {
    const m = urlOrPath.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/s);
    if (!m) throw new Error('readPublicAsset: malformed data URL');
    const contentType = m[1] || 'image/png';
    const isBase64 = urlOrPath.includes(';base64,');
    const bytes = isBase64
      ? Buffer.from(m[2]!, 'base64')
      : Buffer.from(decodeURIComponent(m[2]!), 'utf8');
    return { bytes, contentType };
  }

  // App-relative URL — try disk first, fall back to public HTTP.
  if (!urlOrPath.startsWith('/')) {
    throw new Error(`readPublicAsset: expected '/'-prefixed app path, got "${urlOrPath}"`);
  }

  // Try disk first. Works in local dev where /public is on the
  // function's filesystem.
  try {
    const filePath = path.join(process.cwd(), 'public', urlOrPath.replace(/^\/+/, ''));
    const bytes = await fs.readFile(filePath);
    const contentType = guessMimeFromPath(filePath);
    return { bytes, contentType };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'EISDIR') throw err;
    // Fall through to HTTP fetch.
  }

  // Fall back to HTTP. On Vercel, public/ isn't in the function bundle
  // but the same path is served by the CDN.
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) {
    throw new Error(
      `readPublicAsset: file not on disk and no base URL configured. ` +
        `Set PUBLIC_BASE_URL (preferred), NEXT_PUBLIC_APP_URL, or run on Vercel ` +
        `(VERCEL_URL is auto-set there). Path was: ${urlOrPath}`,
    );
  }
  const fullUrl = `${baseUrl}${urlOrPath}`;
  return await fetchAsBuffer(fullUrl);
}

function resolveBaseUrl(): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, '');
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;
  return '';
}

async function fetchAsBuffer(url: string): Promise<PublicAsset> {
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) {
      throw new Error(`readPublicAsset: HTTP ${res.status} fetching ${url}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? guessMimeFromPath(url);
    return { bytes, contentType };
  } finally {
    clearTimeout(timeoutId);
  }
}

function guessMimeFromPath(p: string): string {
  const ext = path.extname(p).split('?')[0]?.toLowerCase() ?? '';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.png') return 'image/png';
  return 'application/octet-stream';
}

// Convenience: build a base64 data URL for OpenAI vision API
// `image_url.url` param. This is the shape almost every vision
// caller in the codebase wants.
export async function readPublicAssetAsDataUrl(urlOrPath: string): Promise<string> {
  if (urlOrPath.startsWith('data:')) return urlOrPath;
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    // Remote image — pass URL straight through; OpenAI fetches it.
    return urlOrPath;
  }
  const { bytes, contentType } = await readPublicAsset(urlOrPath);
  return `data:${contentType};base64,${bytes.toString('base64')}`;
}
