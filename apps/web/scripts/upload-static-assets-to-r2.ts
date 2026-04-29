// One-shot uploader: pushes the local static catalogs (avatars, music,
// voice samples) to the R2 bucket so production stops depending on
// Vercel's CDN serving public/.
//
// Run from the repo root, with all five CLOUDFLARE_R2_* env vars set:
//   npx tsx apps/web/scripts/upload-static-assets-to-r2.ts
//
// Idempotent — re-running just overwrites existing keys with the same
// bytes. Skip a folder by passing --skip=avatars / --skip=music /
// --skip=voice-samples (comma-separated). Pass --dry to preview
// without uploading.
//
// After this finishes, the assets live at:
//   ${CLOUDFLARE_R2_PUBLIC_URL}/avatars/<id>.png
//   ${CLOUDFLARE_R2_PUBLIC_URL}/music/<filename>.mp3
//   ${CLOUDFLARE_R2_PUBLIC_URL}/voice-samples/<filename>.mp3
//
// Then update apps/web/lib/avatars/catalog.ts and
// packages/shared/src/music/music-library.ts to use those absolute URLs
// (or rely on the V12.1 read-public-asset HTTP fallback that already
// works against the same paths via Vercel CDN).

import { promises as fs } from 'fs';
import path from 'path';
import { config as loadDotenv } from 'dotenv';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Load .env from the repo root so this script works without manual
// env-var exports.
loadDotenv({ path: path.join(__dirname, '../../../.env') });

const REPO_ROOT = path.join(__dirname, '../../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'apps/web/public');

const FOLDERS = [
  { local: 'avatars', remote: 'avatars', exts: ['.png', '.jpg', '.jpeg', '.webp'] },
  { local: 'music', remote: 'music', exts: ['.mp3', '.wav', '.m4a'] },
  { local: 'voice-samples', remote: 'voice-samples', exts: ['.mp3', '.wav', '.m4a'] },
] as const;

function mimeFromExt(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a') return 'audio/mp4';
  return 'application/octet-stream';
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry');
  const skipArg = args.find((a) => a.startsWith('--skip='));
  const skip = new Set(
    (skipArg ? skipArg.replace('--skip=', '') : '').split(',').filter(Boolean),
  );

  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;
  const publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    console.error(
      '❌ Missing R2 env vars. Need CLOUDFLARE_R2_ACCOUNT_ID, ' +
        'CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, ' +
        'CLOUDFLARE_R2_BUCKET_NAME, CLOUDFLARE_R2_PUBLIC_URL.',
    );
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`🔗 Bucket: ${bucket}`);
  console.log(`📍 Public URL: ${publicUrl}`);
  if (dryRun) console.log('⚠ DRY RUN — no uploads will happen.\n');

  let totalFiles = 0;
  let totalBytes = 0;

  for (const folder of FOLDERS) {
    if (skip.has(folder.local)) {
      console.log(`⏭  Skipping ${folder.local}`);
      continue;
    }
    const dir = path.join(PUBLIC_DIR, folder.local);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      console.log(`⚠  ${dir} doesn't exist — skipping`);
      continue;
    }
    const validExts: readonly string[] = folder.exts;
    const files = entries.filter((e) =>
      validExts.includes(path.extname(e).toLowerCase()),
    );
    console.log(`\n📁 ${folder.local} → ${folder.remote}/  (${files.length} files)`);

    for (const file of files) {
      const localPath = path.join(dir, file);
      const remoteKey = `${folder.remote}/${file}`;
      const stat = await fs.stat(localPath);
      const sizeKb = (stat.size / 1024).toFixed(0);
      const contentType = mimeFromExt(file);

      if (dryRun) {
        console.log(`   [DRY] ${remoteKey}  (${sizeKb} KB, ${contentType})`);
        totalFiles++;
        totalBytes += stat.size;
        continue;
      }

      const bytes = await fs.readFile(localPath);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: remoteKey,
            Body: bytes,
            ContentType: contentType,
          }),
        );
        console.log(`   ✓ ${remoteKey}  (${sizeKb} KB)`);
        totalFiles++;
        totalBytes += stat.size;
      } catch (err) {
        console.error(`   ✗ ${remoteKey} — ${(err as Error).message}`);
      }
    }
  }

  const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
  console.log(`\n${dryRun ? 'Would upload' : 'Uploaded'} ${totalFiles} files (${totalMb} MB)`);

  if (!dryRun && totalFiles > 0) {
    console.log(`\nVerify a sample:`);
    console.log(`  curl -sI ${publicUrl}/avatars/eran.png | head -3`);
    console.log(`  curl -sI ${publicUrl}/music/mixkit-beautiful-dream-493.mp3 | head -3`);
  }
}

main().catch((err) => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
