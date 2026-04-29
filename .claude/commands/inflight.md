# /inflight

Audit in-flight timestamp usage across the codebase.

The pattern: set `*InFlightAt = new Date()` BEFORE calling a provider, clear it (`= null`) on both success AND failure. This prevents duplicate provider calls on double-click and shows spinners after page refresh.

Check all three operations:
- `imageInFlightAt` — in `lib/scenes/generate-impl.ts` and `app/api/scenes/[id]/generate/route.ts`
- `voiceInFlightAt` — in `lib/scenes/voice-impl.ts` and `app/api/scenes/[id]/voice/route.ts`
- `clipInFlightAt` — in `lib/scenes/clip-impl.ts` and `app/api/scenes/[id]/clip/route.ts`

For each, confirm: (a) set before provider call, (b) cleared in finally/catch, (c) checked at start to refuse duplicate calls.

Report any gaps as ⚠️ with file:line references.
