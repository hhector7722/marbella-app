import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayrollBatchImportInput, PayrollImportReportDTO } from '@/types/payroll-import';
import { PayrollImportPipeline } from '../payroll/payroll-import-pipeline.ts';

export class ImportMonthlyPayrollUseCase {
  constructor(private readonly supabase: SupabaseClient) {}

  async execute(batchInput: PayrollBatchImportInput): Promise<PayrollImportReportDTO> {
    const pipeline = new PayrollImportPipeline(this.supabase);
    return pipeline.execute(batchInput);
  }
}
