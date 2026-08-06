import { resolveEffectiveContract } from './src/lib/hours-engine/contract-resolver.ts';
import 'dotenv/config';

console.log(resolveEffectiveContract({
  joiningDate: '2025-01-01',
  endDate: '2026-03-04',
  terms: [{
    effectiveFrom: '2025-01-01',
    effectiveTo: '2026-03-04',
    weeklyHours: 40,
    bagMode: true,
    regime: 'staff',
    overtimeRatePerHour: null,
  }]
}, '2026-03-02'));
