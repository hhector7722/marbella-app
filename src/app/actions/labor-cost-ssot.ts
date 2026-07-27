'use server';

import { createClient } from '@/utils/supabase/server';
import {
  buildLaborCostDayDetailFromSnapshots,
  buildLaborCostPeriodFromSnapshots,
  PAYROLL_ORDINARY_ROW_ID,
} from '@/lib/read-models/weekly-snapshot-dto';

export { PAYROLL_ORDINARY_ROW_ID };

export async function getLaborCostPeriodSsot(input: {
  startDate: string;
  endDate: string;
  userId?: string | null;
}) {
  const supabase = await createClient();
  return buildLaborCostPeriodFromSnapshots(supabase, {
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
  return buildLaborCostDayDetailFromSnapshots(
    supabase,
    input.dateYmd,
    input.userId ?? null,
  );
}
