'use server';

import { createClient } from '@/utils/supabase/server';
import type { PayrollBatchImportInput, PayrollImportReportDTO } from '@/types/payroll-import';
import { ImportMonthlyPayrollUseCase } from '@/lib/use-cases/import-monthly-payroll';

export async function importMonthlyPayrollAction(
  input: PayrollBatchImportInput,
): Promise<PayrollImportReportDTO> {
  const supabase = await createClient();

  // Verificar que el usuario sea gestor/administrador
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) {
    throw new Error('No autenticado: Se requiere inicio de sesión.');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .single();

  if (!profile || !['manager', 'admin', 'supervisor'].includes(profile.role)) {
    throw new Error('Sin autorización: Se requieren permisos de gestor para importar nóminas.');
  }

  const useCase = new ImportMonthlyPayrollUseCase(supabase);
  return useCase.execute({
    ...input,
    createdBy: userRes.user.id,
  });
}
