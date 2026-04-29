# /db

Validate the Prisma schema and migration state.

1. Run `npx prisma validate` — report any schema errors.
2. Run `npx prisma format --check` — report any formatting issues.
3. Read `prisma/schema.prisma` and list: all models, their row counts of columns, and any columns marked optional that probably should be required (or vice versa).
4. Check that every `DateTime?` in-flight column (imageInFlightAt, voiceInFlightAt, clipInFlightAt) has a corresponding clear path in the relevant impl file.
5. List the latest 3 migration file names from `prisma/migrations/`.

Be concise — under 30 lines total.
