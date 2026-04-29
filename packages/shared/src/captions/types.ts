// Shared types for the Hebrew caption pipeline.
//
// Everything here is timing-source agnostic. The web app feeds in the
// raw character timings from ElevenLabs (the with-timestamps endpoint
// returns one entry per character); the worker and the script-action
// consume the higher-level `WordTiming` and `CaptionChunk` shapes.

export interface CharacterTiming {
  /** Single Hebrew character (or punctuation, space, etc.). */
  char: string;
  /** Start time in MILLISECONDS, relative to the start of the audio file. */
  startMs: number;
  /** End time in MILLISECONDS, relative to the start of the audio file. */
  endMs: number;
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

// A phrase-level on-screen caption. Times come in two flavors:
//   - `startMs`/`endMs` are scene-relative (audio file coordinates).
//   - `globalStartMs`/`globalEndMs` are populated by the renderer once
//     it knows the cumulative scene timeline.
export interface CaptionChunk {
  sceneId?: string;
  text: string;
  startMs: number;
  endMs: number;
  globalStartMs?: number;
  globalEndMs?: number;
  lineCount: number;
  wordCount: number;
}

export type CaptionsMode = 'off' | 'phrase' | 'word_highlight';

export interface SceneCaptionInput {
  sceneId: string;
  /** Cumulative offset of the scene's audio in the final video (ms). */
  timelineStartMs: number;
  /** True when the scene's clip embeds audio (PixVerse lipsync); the
   *  timeline still uses the clip duration so the captions stay
   *  aligned, but downstream may want to know. */
  audioBakedIn?: boolean;
  /** Defensive cap — the caption window won't extend past
   *  `timelineStartMs + clipDurationMs` even if the audio probe was a
   *  hair longer than the rendered clip. */
  clipDurationMs: number;
  /** Pre-computed caption chunks (scene-relative). When null, captions
   *  for this scene are skipped. */
  chunks: CaptionChunk[] | null;
}
