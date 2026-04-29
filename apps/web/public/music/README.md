# Background music library

This folder is the **only** source of background-music tracks for the
final video composition pipeline. There is no remote music API, no
runtime download, no commercial trending songs. The renderer picks one
track from this folder, loops + trims it to the final video duration,
mixes it under the Hebrew voice-over at low volume, and fades it out
during the last 2 seconds.

## Files

17 royalty-free Mixkit tracks — metadata is declared in
`packages/shared/src/music/music-library.ts`. Adding a new track is a
two-step change:

1. Drop the `.mp3` into this folder.
2. Append a `MusicTrack` entry in `music-library.ts` with `id`, `title`,
   `fileUrl: "/music/<filename>.mp3"`, conservative defaults
   (`source: "user_provided"`, `license: "user_provided_free_to_use"`,
   `attributionRequired: false`, `allowedPlatforms: ["all"]`), and your
   best-guess mood/style/energy.

If a filename's mood is unclear, classify CONSERVATIVELY (low energy,
`general_ugc` style) instead of skipping the track. The selector
handles ambiguity by falling back to a safe generic UGC bed.

## How a track gets picked

1. The script LLM emits a `music_profile` block (mood, energy, style,
   target_volume) per script — see
   `packages/prompts/src/script-json-schema.ts`.
2. At final-render time, `selectMusicTrack` in
   `packages/shared/src/music/select-music.ts` scores every track in
   the library against the profile + product category + script
   framework.
3. The top-scorer wins. If no track scores above the threshold, a safe
   low-energy fallback (ambient / soft-pop / general-UGC) plays
   instead. **High-energy tracks are never used as a generic fallback.**
4. The Step-1 toggle (`productData.backgroundMusic`) is the master
   switch — when off, no music layer is added at all.

## How the renderer uses the file

`apps/worker/src/providers/composition/ffmpeg.ts`:

* `-stream_loop -1` on the music input → ffmpeg replays the track
  infinitely so a 60s loop covers a 90s ad without abrupt cuts.
* `atrim=duration=<final>` cuts the looped stream to exactly the final
  video duration.
* `volume=0.08` (clamped to `[0.04, 0.20]`) keeps Hebrew voice
  dominant.
* `afade=t=in:st=0:d=0.3` adds a soft 300ms fade-in.
* `afade=t=out:st=<end-2>:d=2` runs the mandatory 2-second closing
  fade-out so music never cuts abruptly.
* `amix duration=first` locks the output length to the voice track —
  music never extends the final video by a silent tail.

## Licensing

Every track in this folder is treated as **user-provided, free-to-use,
no attribution required**. If you replace a file with one that has
different license terms, update the corresponding `MusicTrack` entry —
the renderer surfaces `license` + `attributionRequired` to the admin
debug payload so any non-free track gets flagged.
