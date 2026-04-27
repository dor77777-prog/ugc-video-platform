// Storage abstraction. Today: writes generated images to apps/web/public/uploads
// (works in `next dev`, NOT in production — Vercel/serverless prod needs cloud
// storage). When SUPABASE_SERVICE_ROLE_KEY is set we'll auto-swap to
// SupabaseStorage. Keep the interface tight so swapping is a one-line change.

export interface StorageProvider {
  readonly name: string;
  // Returns a URL the browser can fetch (absolute or app-relative).
  putBytes(input: { folder: string; filename: string; data: Uint8Array; contentType: string }): Promise<{ url: string }>;
}

let cached: StorageProvider | null = null;

export async function getStorage(): Promise<StorageProvider> {
  if (cached) return cached;
  // Future: if (process.env.SUPABASE_SERVICE_ROLE_KEY) { cached = new SupabaseStorage(); return cached; }
  const { LocalStorage } = await import('./local');
  cached = new LocalStorage();
  return cached;
}
