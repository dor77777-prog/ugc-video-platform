// Hebrew caption chunker.
//
// Converts ElevenLabs character timings into:
//   1. Word timings (one entry per Hebrew word)
//   2. Phrase-level CaptionChunks (2-5 words, max 2 lines, ~18 chars/line)
//
// Why phrase-level: word-by-word UGC captions look frantic and force
// the viewer to read every frame; full-sentence captions stay frozen
// for 4-5s and the viewer reads ahead and ignores the visuals. The
// 2-5-word sweet spot mimics the way Reels/TikTok creators caption.
//
// The chunker is pure (no I/O) so it can be unit-tested without any
// audio files or DB.

import type { CaptionChunk, CharacterTiming, WordTiming } from './types';

// Hebrew letters + final forms + niqqud (kept for word-grouping; we
// don't render niqqud separately, but they shouldn't break a word).
const HEBREW_LETTER_RE = /[֐-׿]/;
// Latin letters + digits — we also accept these as part of a "word"
// (think product names like "iPhone" or "5%"). They get merged into
// the surrounding Hebrew word so a chunk like "ב-50 שקל" doesn't get
// shattered into 4 micro-words.
const WORD_CHAR_RE = /[֐-׿A-Za-z0-9%₪$]/;

const PUNCTUATION_BREAK_RE = /[.,!?;:—…]/;
const STRONG_BREAK_PUNCT = /[.!?]/;
const SOFT_BREAK_PUNCT = /[,;:—…]/;

/**
 * Bucket a flat list of character timings into word-level timings.
 *
 * The algorithm walks left → right and accumulates non-whitespace
 * runs into a "current word". Whitespace AND punctuation flush the
 * current word; punctuation also gets attached to the trailing word
 * (so "כן," stays together) which is more natural for caption display.
 *
 * Hebrew-specific notes:
 *   - The ElevenLabs alignment array is in *logical* (read) order, not
 *     visual order. We preserve that order — libass handles the bidi
 *     when rendering to ASS, and our caller never reverses the array.
 *   - Niqqud (vowel marks) live BETWEEN consonants in logical order.
 *     They share a code-point range with letters, so the WORD_CHAR_RE
 *     accepts them implicitly.
 */
export function charactersToWords(chars: CharacterTiming[]): WordTiming[] {
  const words: WordTiming[] = [];
  let current: { letters: string[]; startMs: number; endMs: number } | null = null;

  const flush = () => {
    if (current && current.letters.length > 0) {
      const word = current.letters.join('').trim();
      if (word.length > 0) {
        words.push({
          word,
          startMs: current.startMs,
          endMs: current.endMs,
        });
      }
    }
    current = null;
  };

  for (const c of chars) {
    const ch = c.char;
    if (!ch) continue;

    // Whitespace → flush.
    if (/\s/.test(ch)) {
      flush();
      continue;
    }

    // Punctuation: attach to the current word if there is one (so the
    // word's endMs stretches to cover the punctuation tick), then
    // flush — the next non-whitespace char starts a new word.
    if (PUNCTUATION_BREAK_RE.test(ch)) {
      if (current) {
        current.letters.push(ch);
        current.endMs = c.endMs;
      }
      flush();
      continue;
    }

    // Word-character.
    if (WORD_CHAR_RE.test(ch)) {
      if (!current) {
        current = { letters: [ch], startMs: c.startMs, endMs: c.endMs };
      } else {
        current.letters.push(ch);
        current.endMs = c.endMs;
      }
      continue;
    }

    // Anything else — quote marks, parentheses, currency symbols we
    // didn't list. Treat like punctuation: attach + flush.
    if (current) {
      current.letters.push(ch);
      current.endMs = c.endMs;
    }
    flush();
  }
  flush();

  return words;
}

export interface ChunkOptions {
  /** Min words per chunk. Default 2. */
  minWords?: number;
  /** Max words per chunk. Default 5. */
  maxWords?: number;
  /** Max characters per logical line (without spaces). Default 18. */
  maxCharsPerLine?: number;
  /** Min on-screen time in ms. Default 650. */
  minDurationMs?: number;
  /** Max on-screen time in ms. Default 2200. */
  maxDurationMs?: number;
  /** Allow overrunning maxDurationMs for the LAST chunk so the CTA
   *  can hold on screen. Default true. */
  allowFinalHold?: boolean;
}

/**
 * Split a list of word timings into phrase-level CaptionChunks.
 *
 * Algorithm:
 *   1. Build a strong-break list (punctuation that ends a thought:
 *      ".", "!", "?") and a soft-break list (",", ";", ":", "…", "—").
 *   2. Walk words left → right, collecting them into a buffer. Flush
 *      when:
 *        a. word count hits maxWords
 *        b. accumulated chars exceeds 2 lines × maxCharsPerLine
 *        c. duration since chunk start exceeds maxDurationMs
 *        d. the just-added word ends in a strong-break punctuation
 *        e. the just-added word ends in a soft-break punctuation AND
 *           the buffer already has ≥ minWords
 *   3. After flushing, if the chunk's duration is below minDurationMs,
 *      stretch its endMs to satisfy the floor (without overlapping the
 *      next chunk's startMs).
 */
export function chunkCaptions(
  words: WordTiming[],
  opts: ChunkOptions = {},
): CaptionChunk[] {
  const minWords = opts.minWords ?? 2;
  const maxWords = opts.maxWords ?? 5;
  const maxCharsPerLine = opts.maxCharsPerLine ?? 18;
  const minDurationMs = opts.minDurationMs ?? 650;
  const maxDurationMs = opts.maxDurationMs ?? 2200;
  const allowFinalHold = opts.allowFinalHold ?? true;

  if (words.length === 0) return [];

  // Two-line budget — counted as raw chars (excluding inter-word spaces)
  // because Hebrew letters render at roughly equal width and adding
  // spaces under-counts the visual line length. The 2× multiplier
  // gives us "two lines of ~18 chars" headroom.
  const maxCharsBudget = maxCharsPerLine * 2;

  const chunks: CaptionChunk[] = [];
  let buf: WordTiming[] = [];
  let bufChars = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const startMs = buf[0]!.startMs;
    const endMs = buf[buf.length - 1]!.endMs;
    const text = buf.map((w) => w.word).join(' ');
    chunks.push({
      text,
      startMs,
      endMs,
      lineCount: text.length > maxCharsPerLine ? 2 : 1,
      wordCount: buf.length,
    });
    buf = [];
    bufChars = 0;
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    buf.push(w);
    bufChars += w.word.length;

    const tail = w.word[w.word.length - 1] ?? '';
    const hitMaxWords = buf.length >= maxWords;
    const hitCharBudget = bufChars > maxCharsBudget;
    const hitMaxDuration = w.endMs - buf[0]!.startMs > maxDurationMs;
    const strongBreak = STRONG_BREAK_PUNCT.test(tail);
    const softBreak = SOFT_BREAK_PUNCT.test(tail);

    if (
      hitMaxWords ||
      hitCharBudget ||
      hitMaxDuration ||
      strongBreak ||
      (softBreak && buf.length >= minWords)
    ) {
      flush();
    }
  }
  flush();

  // Stretch under-duration chunks up to the next chunk's start (or by
  // the min-duration floor if we're at the end).
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    const duration = c.endMs - c.startMs;
    if (duration >= minDurationMs) continue;
    const next = chunks[i + 1];
    const headroom = next
      ? Math.max(0, next.startMs - c.endMs)
      : Number.POSITIVE_INFINITY;
    const want = minDurationMs - duration;
    const take = Math.min(headroom, want);
    c.endMs = c.endMs + take;
  }

  // Final chunk hold — let the CTA breathe a beat past the strict cap.
  if (allowFinalHold && chunks.length > 0) {
    const last = chunks[chunks.length - 1]!;
    const FINAL_HOLD_BONUS_MS = 600;
    last.endMs = last.endMs + FINAL_HOLD_BONUS_MS;
  }

  return chunks;
}
