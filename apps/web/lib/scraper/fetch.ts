// Safe HTTP fetch with SSRF protections, size cap, timeout, and content-type check.
// Used for both the main page fetch and platform-specific JSON endpoints (Shopify .js).

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const TIMEOUT_MS = 10_000;
const USER_AGENT = 'tachles-scraper/0.1 (+https://tachles.video)';

export class ScrapeFetchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'invalid_url'
      | 'private_host'
      | 'timeout'
      | 'http_error'
      | 'too_large'
      | 'bad_content_type'
      | 'network',
  ) {
    super(message);
  }
}

function isPrivateOrLocalHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  // IPv4 private / loopback / link-local
  const m = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [, a, b] = m.map(Number);
    if (a === undefined || b === undefined) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local + AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
  }
  // IPv6 loopback / link-local — basic check
  if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  return false;
}

export interface SafeFetchResult {
  body: string;
  finalUrl: string;
  contentType: string;
}

export async function safeFetch(rawUrl: string): Promise<SafeFetchResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ScrapeFetchError('Invalid URL', 'invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScrapeFetchError('Only http(s) URLs are allowed', 'invalid_url');
  }
  if (isPrivateOrLocalHost(url.hostname)) {
    throw new ScrapeFetchError('Private/internal hosts are not allowed', 'private_host');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // V26.SEC — manual redirect handling so each hop is re-validated
    // against the SSRF allowlist. Without this, an attacker can host a
    // public URL (e.g. example.com/redirect) that 302-redirects to
    // http://127.0.0.1:8080 / http://169.254.169.254 — Node's fetch
    // with redirect: 'follow' transparently follows it and the
    // upstream isPrivateOrLocalHost() check on the original URL is
    // bypassed. We cap the chain at 5 hops (typical max in practice).
    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      try {
        res = await fetch(currentUrl, {
          signal: controller.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5',
            'Accept-Language': 'he,en;q=0.9',
          },
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          throw new ScrapeFetchError('Fetch timed out', 'timeout');
        }
        throw new ScrapeFetchError(`Network error: ${(err as Error).message}`, 'network');
      }
      // Status 3xx with a Location header → re-validate next hop.
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) break; // 3xx without Location — treat as terminal
        if (hop === MAX_REDIRECTS) {
          throw new ScrapeFetchError('Too many redirects', 'http_error');
        }
        let next: URL;
        try {
          next = new URL(loc, currentUrl);
        } catch {
          throw new ScrapeFetchError('Invalid redirect Location', 'invalid_url');
        }
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          throw new ScrapeFetchError('Redirect to non-http(s) blocked', 'invalid_url');
        }
        if (isPrivateOrLocalHost(next.hostname)) {
          throw new ScrapeFetchError(
            'Redirect to private/internal host blocked',
            'private_host',
          );
        }
        currentUrl = next;
        continue;
      }
      break;
    }
    if (!res) {
      throw new ScrapeFetchError('No response after redirect chain', 'network');
    }

    if (!res.ok) {
      throw new ScrapeFetchError(`HTTP ${res.status} ${res.statusText}`, 'http_error');
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');
    const isJson =
      contentType.includes('application/json') || contentType.includes('javascript');
    if (!isHtml && !isJson) {
      throw new ScrapeFetchError(`Unexpected content-type: ${contentType}`, 'bad_content_type');
    }

    // Stream-read with size cap.
    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      if (text.length > MAX_BYTES) throw new ScrapeFetchError('Response too large', 'too_large');
      return { body: text, finalUrl: res.url, contentType };
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new ScrapeFetchError('Response too large (>5MB)', 'too_large');
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const body = buffer.toString('utf-8');
    return { body, finalUrl: res.url, contentType };
  } finally {
    clearTimeout(timer);
  }
}
