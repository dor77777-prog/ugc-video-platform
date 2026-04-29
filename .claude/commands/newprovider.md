# /newprovider $ARGUMENTS

Guide for adding a new AI provider to the tachles pipeline.

The user wants to add: $ARGUMENTS

Walk through the checklist:

1. **Interface** — does `apps/worker/src/providers/<type>/interface.ts` exist? If not, create it first.
2. **Implementation file** — create `apps/worker/src/providers/<type>/<name>.ts` (NOT mock.ts).
3. **Cost tracking** — add the operation to `apps/web/lib/pricing/provider-costs.ts` with accurate USD cost.
4. **Credit pricing** — add to `PER_OPERATION_CREDITS` in `apps/web/lib/plans.ts`.
5. **ApiCall logging** — use two-phase logging (insert in_progress, update to success/failed). Use `lib/usage/log.ts`.
6. **In-flight timestamp** — if user-triggerable, add `*InFlightAt` column to Scene in schema.prisma + migration.
7. **Env var** — add the API key name to the "Required env vars" section in README.md and .env.example if it exists.
8. **No mock in active path** — the mock.ts is a template only. Wire the real implementation from day one.

For each step, check if it already exists and show what needs to be done.
