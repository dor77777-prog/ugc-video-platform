// V14 PR8 verification — Hebrew caption bidi wrap.
//
// User reported: in exported videos, punctuation in Hebrew captions
// (period, comma, ?, !) was rendering on the visual-right (logical
// start) of the line instead of the visual-left (logical end). Caused
// by libass + fribidi treating trailing punctuation as inheriting the
// surrounding paragraph direction (LTR by default in ASS) when no
// explicit isolate is set.
//
// Fix: wrap each Hebrew-containing caption in U+202B RLE ... U+2069
// PDF before emitting to the Dialogue line. Pure-LTR captions are
// untouched.
//
// This test asserts:
//   1. wrapHebrewBidi wraps Hebrew text in RLE...PDF
//   2. wrapHebrewBidi NO-OPS pure ASCII / English text
//   3. wrapHebrewBidi handles mixed-script (Hebrew + English) by
//      wrapping the whole thing
//   4. sanitizeAssText does NOT strip RLE/PDF (the chars survive a
//      round trip through the sanitizer)
//   5. buildAssFromChunks emits Hebrew Dialogue lines with RLE/PDF
//   6. buildAssFromChunks emits English-only Dialogue lines WITHOUT
//      RLE/PDF (no-op for LTR)

import {
  buildAssFromChunks,
  sanitizeAssText,
  wrapHebrewBidi,
} from '@ugc-video/shared';
import type { CaptionChunk } from '@ugc-video/shared';

const RLE = '‫';
const PDF = '‬';

let failures = 0;
function ok(name: string) {
  console.log(`✓ ${name}`);
}
function fail(name: string, detail: string) {
  failures++;
  console.error(`✗ ${name}\n   ${detail}`);
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name);
  else fail(name, detail);
}

// ── 1. Hebrew text gets wrapped ───────────────────────────────────────
{
  const wrapped = wrapHebrewBidi('שלום לכולם.');
  assert(
    wrapped.startsWith(RLE),
    '[V14 PR8.1] wrapHebrewBidi prepends U+202B RLE to Hebrew text',
  );
  assert(
    wrapped.endsWith(PDF),
    '[V14 PR8.1] wrapHebrewBidi appends U+202C PDF to Hebrew text',
  );
  assert(
    wrapped.includes('שלום לכולם.'),
    '[V14 PR8.1] inner Hebrew text preserved verbatim (including the trailing period)',
  );
}

// ── 2. Pure-LTR text is NOT wrapped ────────────────────────────────────
{
  for (const t of ['Hello world.', 'Buy Now!', '123 USD', '']) {
    const out = wrapHebrewBidi(t);
    assert(
      out === t,
      `[V14 PR8.2] wrapHebrewBidi("${t}") is a no-op for pure-LTR text`,
      `got: "${out}"`,
    );
  }
}

// ── 3. Mixed-script gets wrapped (Hebrew triggers it) ──────────────────
{
  const wrapped = wrapHebrewBidi('Hello אחותי, how are you?');
  assert(
    wrapped.startsWith(RLE) && wrapped.endsWith(PDF),
    '[V14 PR8.3] mixed Hebrew+English text gets the RLE/PDF wrapping',
  );
}

// ── 4. sanitizeAssText preserves RLE / PDF ─────────────────────────────
{
  const wrapped = wrapHebrewBidi('תקשיבי שנייה.');
  const sanitized = sanitizeAssText(wrapped);
  assert(
    sanitized.startsWith(RLE) && sanitized.endsWith(PDF),
    '[V14 PR8.4] sanitizeAssText does NOT strip U+2067/U+2069',
  );
  assert(
    sanitized.includes('תקשיבי שנייה.'),
    '[V14 PR8.4] inner Hebrew text + period survive sanitization',
  );
}

// ── 5. End-to-end: buildAssFromChunks wraps Hebrew Dialogue lines ──────
{
  const chunks: CaptionChunk[] = [
    {
      id: 'c1',
      text: 'שלום לכולם.',
      startMs: 0,
      endMs: 1000,
      globalStartMs: 0,
      globalEndMs: 1000,
    } as unknown as CaptionChunk,
  ];
  const ass = buildAssFromChunks(chunks);
  // Dialogue lines should contain the RLE bytes wrapping the Hebrew.
  assert(
    ass.includes(RLE) && ass.includes(PDF),
    '[V14 PR8.5] buildAssFromChunks emits RLE/PDF for Hebrew chunks',
  );
  assert(
    /Dialogue:.*שלום לכולם\./.test(ass),
    '[V14 PR8.5] Hebrew text + period preserved in the Dialogue line',
  );
}

// ── 6. Pure-English chunks emit no RLE/PDF (no-op for LTR) ─────────────
{
  const chunks: CaptionChunk[] = [
    {
      id: 'c1',
      text: 'Hello world.',
      startMs: 0,
      endMs: 1000,
      globalStartMs: 0,
      globalEndMs: 1000,
    } as unknown as CaptionChunk,
  ];
  const ass = buildAssFromChunks(chunks);
  assert(
    !ass.includes(RLE) && !ass.includes(PDF),
    '[V14 PR8.6] pure-LTR caption produces NO RLE/PDF in the ASS file',
  );
  assert(
    /Dialogue:.*Hello world\./.test(ass),
    '[V14 PR8.6] English text preserved verbatim',
  );
}

// ── 7. Determinism — same input → byte-identical wrapping ─────────────
{
  const text = 'אחותי, את חייבת לראות את זה.';
  const a = wrapHebrewBidi(text);
  let mismatch = 0;
  for (let i = 0; i < 100; i++) {
    if (wrapHebrewBidi(text) !== a) mismatch++;
  }
  assert(
    mismatch === 0,
    '[V14 PR8.7] wrapHebrewBidi byte-identical across 100 calls',
  );
}

console.log('');
if (failures === 0) {
  console.log('V14 PR8 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`V14 PR8 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
