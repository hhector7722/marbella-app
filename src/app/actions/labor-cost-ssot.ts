'use server';

import { createClient } from '@/utils/supabase/server';
import { GetDailyLaborCostUseCase } from '@/lib/use-cases/get-daily-labor-cost';
import { GetMonthlyLaborCostSummaryUseCase } from '@/lib/use-cases/get-monthly-labor-cost-summary';

export async function getLaborCostPeriodSsot(input: {
  startDate: string;
  endDate: string;
  userId?: string | null;
}) {
  const supabase = await createClient();
  const useCase = new GetMonthlyLaborCostSummaryUseCase(supabase);
  return useCase.execute({
    startDate: input.startDate,
    endDate: input.endDate,
    userId: input.userId ?? null,
  });
}

export async function getLaborCostDayDetailSsot(input: {
  dateYmd: string;
  userId?: string | null;
  includeAllContracted?: boolean;
}) {
  const supabase = await createClient();
  const useCase = new GetDailyLaborCostUseCase(supabase);
  return useCase.execute(input.dateYmd, {
    userId: input.userId ?? null,
    includeAllContracted: input.includeAllContracted ?? false,
  });
}
