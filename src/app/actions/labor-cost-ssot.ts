'use server';

import { createClient } from '@/utils/supabase/server';
import {
  buildLaborCostDayDetailFromSsot,
  buildLaborCostPeriodFromSsot,
} from '@/lib/hours-engine/labor-cost-ssot';

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
  date: string;
  userId?: string | null;
}) {
  const supabase = await createClient();
  return buildLaborCostDayDetailFromSsot(
    supabase,
    input.date,
    input.userId ?? null,
  );
}
