'use server';

import { createClient } from '@/utils/supabase/server';
import {
  buildLaborCostDayDetailFromSsot,
  buildLaborCostPeriodFromSsot,
  PAYROLL_ORDINARY_ROW_ID,
} from '@/lib/hours-engine';

export { PAYROLL_ORDINARY_ROW_ID };

export async function getLaborCostPeriodSsot(input: {
  startDate: string;
  endDate: string;
  userId?: string | null;
}) {
  const supabase = await createClient();
  return buildLaborCostPeriodFromSsot(supabase, {
    startDate: input.startDate,
    endDate: input.endDate,
    userId: input.userId ?? null,
  });
}

export async function getLaborCostDayDetailSsot(input: {
  dateYmd: string;
  userId?: string | null;
}) {
  const supabase = await createClient();
  return buildLaborCostDayDetailFromSsot(
    supabase,
    input.dateYmd,
    input.userId ?? null,
  );
}
