// Quick CLI: query PixVerse for account balance + recent generations.
// Uses the same API-KEY header the runtime pipeline uses.

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const PIXVERSE_API_BASE =
  process.env.PIXVERSE_API_BASE_URL ?? 'https://app-api.pixverse.ai';
const KEY = process.env.PIXVERSE_API_KEY;

if (!KEY) {
  console.error('PIXVERSE_API_KEY missing');
  process.exit(1);
}

async function hit(p: string) {
  const url = `${PIXVERSE_API_BASE}${p}`;
  const res = await fetch(url, {
    headers: {
      'API-KEY': KEY!,
      'Ai-Trace-Id': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
  });
  const body = await res.text();
  console.log(`\n=== ${p}`);
  console.log(`HTTP ${res.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2).slice(0, 4000));
  } catch {
    console.log(body.slice(0, 1000));
  }
}

async function main() {
  // Try the typical balance endpoints — PixVerse docs aren't fully public,
  // so we probe several common shapes.
  await hit('/openapi/v2/account/balance');
  await hit('/openapi/v2/user/balance');
  await hit('/openapi/v2/balance');
  await hit('/openapi/v2/credits');
  await hit('/openapi/v2/account');
  // Recent generations / video list — useful for activity audit.
  await hit('/openapi/v2/video/list?page=1&size=20');
  await hit('/openapi/v2/video/list');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
