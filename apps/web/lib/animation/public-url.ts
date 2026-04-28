// Resolve a "/uploads/..." app-relative URL to one that an external
// provider (Kling) can fetch from the public internet.
//
// Why this exists:
//   The Kling LipSync API takes `video_url` and `audio_url` — Kling's
//   server fetches them. Our voice MP3s and silent clips live on the
//   local filesystem under apps/web/public/uploads/, served by the dev
//   server at http://localhost:3000/uploads/... . Localhost is NOT
//   reachable from Kling's network.
//
// Resolution order:
//   1. PUBLIC_BASE_URL — explicit override. Set this in prod (Vercel/
//      Cloudflare deploy URL) or in dev when running ngrok / cloudflared.
//   2. Falls through to localhost. Useful when KLING_API_BASE_URL points
//      at a Kling wrapper running on the same host (e.g. a relay) — but
//      the official Kling endpoint will fail with a fetch error in this
//      mode, so the caller should set KLING_LIPSYNC_MOCK=1 in that case.

const KLING_FETCHABLE_HOSTS_ALLOWLIST = ['ngrok.io', 'trycloudflare.com', 'loca.lt'];

export class PublicUrlError extends Error {
  constructor(
    message: string,
    public readonly internalUrl: string,
  ) {
    super(message);
    this.name = 'PublicUrlError';
  }
}

export function isPublicUrl(u: string): boolean {
  return u.startsWith('http://') || u.startsWith('https://');
}

// Convert an app-relative /uploads/... path or full URL to a public URL.
// Throws if the resulting URL still points at localhost — that would
// fail when handed to Kling's server.
export function toPublicUrl(internalUrl: string): string {
  if (isPublicUrl(internalUrl) && !/^http:\/\/localhost|127\.0\.0\.1/.test(internalUrl)) {
    return internalUrl;
  }
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (!base) {
    throw new PublicUrlError(
      'Cannot expose ' +
        internalUrl +
        ' to Kling: PUBLIC_BASE_URL env is not set. ' +
        'In dev, run a tunnel (ngrok / cloudflared) and set PUBLIC_BASE_URL ' +
        'to the public host. In prod, set it to your deploy URL. ' +
        'Alternatively, set KLING_LIPSYNC_MOCK=1 to skip lipsync.',
      internalUrl,
    );
  }
  if (internalUrl.startsWith('/')) {
    return `${base}${internalUrl}`;
  }
  // Strip the localhost prefix and re-attach the public base.
  const stripped = internalUrl.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, '');
  return `${base}${stripped}`;
}

// Soft-check: does the public-base look like a known tunneling host
// or a user-set domain? Useful for status diagnostics in /admin.
export function publicBaseLooksFetchable(): boolean {
  const base = process.env.PUBLIC_BASE_URL ?? '';
  if (!base) return false;
  if (/^http:\/\/localhost|127\.0\.0\.1/.test(base)) return false;
  return (
    /^https:\/\//.test(base) ||
    KLING_FETCHABLE_HOSTS_ALLOWLIST.some((h) => base.includes(h))
  );
}
