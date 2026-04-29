export interface StorageProvider {
  readonly name: string;
  // Returns a URL the browser can fetch (absolute or app-relative).
  putBytes(input: { folder: string; filename: string; data: Uint8Array; contentType: string }): Promise<{ url: string }>;
}

let cached: StorageProvider | null = null;

export async function getStorage(): Promise<StorageProvider> {
  if (cached) return cached;
  if (process.env.CLOUDFLARE_R2_BUCKET_NAME) {
    const { R2Storage } = await import('./r2');
    cached = new R2Storage();
  } else {
    const { LocalStorage } = await import('./local');
    cached = new LocalStorage();
  }
  return cached;
}
