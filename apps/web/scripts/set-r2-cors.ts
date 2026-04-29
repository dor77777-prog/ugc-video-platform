// One-shot: configure CORS on the R2 bucket so the browser can fetch
// voice samples / images / clips that the UI loads via fetch() or
// `<audio>`/`<video>` with CORS-sensitive paths (Range requests, byte
// streaming).
//
// Without this, the prod app (https://tachles-lac.vercel.app) sees
// "Failed to fetch" or "CORS policy" errors when loading files from
// `https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/...`.
//
// Run once after creating the bucket / changing CORS:
//   npx tsx apps/web/scripts/set-r2-cors.ts

import path from 'path';
import { config as loadDotenv } from 'dotenv';
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from '@aws-sdk/client-s3';

loadDotenv({ path: path.join(__dirname, '../../../.env') });

async function main() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('❌ Missing R2 env vars');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  // Allow GET + HEAD from the production Vercel domain + localhost dev.
  // Wildcard-allow other methods would let third parties run heavier
  // requests; we keep the rules narrow.
  const rules = [
    {
      AllowedMethods: ['GET', 'HEAD'],
      AllowedOrigins: [
        'https://tachles-lac.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001',
        // Vercel preview URLs share a domain pattern — allow them too.
        'https://*.vercel.app',
      ],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type', 'Accept-Ranges'],
      MaxAgeSeconds: 3600,
    },
  ];

  console.log(`🔗 Bucket: ${bucket}`);
  console.log(`🔧 Setting CORS rules:\n${JSON.stringify(rules, null, 2)}\n`);

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: rules },
    }),
  );

  // Read back to confirm.
  const got = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log('✅ CORS applied. Current rules from R2:');
  console.log(JSON.stringify(got.CORSRules, null, 2));
  console.log(
    '\nVerify in the browser DevTools — voice samples should load without "Failed to fetch".',
  );
}

main().catch((err) => {
  console.error('💥', err);
  process.exit(1);
});
