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
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
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
