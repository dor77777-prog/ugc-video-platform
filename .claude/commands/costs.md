# /costs

Audit provider costs and credit pricing for consistency.

Check:
1. Read `apps/web/lib/pricing/provider-costs.ts` — list every provider operation and its USD cost.
2. Read `apps/web/lib/plans.ts` — list PER_OPERATION_CREDITS for each operation.
3. Cross-check: for each operation, show USD cost → credits charged → effective $/credit.
4. Flag any operations that are missing from either file, or where the credit charge seems inconsistent with the USD cost.

Report as a table. Be concise.
