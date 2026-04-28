// Quick CLI: query Kling /account/costs to see remaining resource pack
// units. Uses the same JWT auth helper the runtime pipeline uses, so any
// auth issue here will manifest the same way for the actual i2v calls.

import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const KLING_API_BASE = 'https://api-singapore.klingai.com';

function signJwt(): string {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) throw new Error('KLING_ACCESS_KEY / KLING_SECRET_KEY missing');
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const headerB64 = enc({ alg: 'HS256', typ: 'JWT' });
  const payloadB64 = enc({ iss: ak, exp: now + 1800, nbf: now - 5 });
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', sk).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

async function main() {
  // 30-day window so we get current packs + their full lifetime activity.
  const end = Date.now();
  const start = end - 30 * 24 * 60 * 60 * 1000;

  const url = `${KLING_API_BASE}/account/costs?start_time=${start}&end_time=${end}`;
  const token = signJwt();
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const body = await res.text();
  console.log(`HTTP ${res.status}`);
  try {
    const json = JSON.parse(body);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(body);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
