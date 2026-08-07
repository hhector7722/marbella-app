#!/bin/bash
node test-idempotency-1.mjs
echo "Deleted totals. Now running backfill..."
npx tsx src/scripts/payroll-backfill.ts > /dev/null
echo "Run 2 complete. Active facts:"
node test-idempotency-1.mjs
echo "Deleted totals. Now running backfill..."
npx tsx src/scripts/payroll-backfill.ts > /dev/null
echo "Run 3 complete. Active facts:"
node test-idempotency-1.mjs
