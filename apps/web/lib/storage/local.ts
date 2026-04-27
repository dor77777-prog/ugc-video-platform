import { promises as fs } from 'fs';
import path from 'path';
import type { StorageProvider } from './index';

// Writes to apps/web/public/uploads/<folder>/<filename> and returns a relative
// URL ("/uploads/...") that Next.js serves directly.
//
// NOT FOR PRODUCTION — Vercel/serverless filesystems are read-only at runtime.
// In prod, swap to a cloud-backed StorageProvider (Supabase / S3 / R2).
export class LocalStorage implements StorageProvider {
  readonly name = 'local-fs';
  private readonly publicRoot: string;

  constructor() {
    // process.cwd() in dev is apps/web (where `next dev` is run from).
    this.publicRoot = path.join(process.cwd(), 'public', 'uploads');
  }

  async putBytes({
    folder,
    filename,
    data,
  }: {
    folder: string;
    filename: string;
    data: Uint8Array;
    contentType: string;
  }): Promise<{ url: string }> {
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const dir = path.join(this.publicRoot, safeFolder);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, safeFilename);
    await fs.writeFile(filePath, data);
    return { url: `/uploads/${safeFolder}/${safeFilename}` };
  }
}
