# /pipeline

Show the current pipeline status and identify any broken stages.

Check the following and report concisely:
1. Are all 6 pipeline stages implemented with real providers? (scrape → intelligence → scripts → images → voice → clip → render)
2. Any `mock.ts` files being imported in the active path (grep for `mock` imports in non-mock files)?
3. Any `TODO` or `FIXME` in lib/scenes/, lib/animation/, lib/llm/?
4. TypeScript errors: run `npm run typecheck` and summarize failures.

Report as a bullet list: ✅ working / ⚠️ issue / ❌ broken. Keep it under 20 lines.
