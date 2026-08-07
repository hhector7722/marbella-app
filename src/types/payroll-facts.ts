/**
 * Tipos DTO y definiciones del modelo de persistencia para `employee_payroll_facts` (FASE 1).
 */

export type SettlementType = 'ordinary' | 'complementary' | 'severance' | 'adjustment';
export type FactStatus = 'active' | 'superseded' | 'cancelled';

export type EmployeePayrollFactRow = {
  id: string;
  user_id: string;
  period_ym: string;
  settlement_type: SettlementType;
  version: number;
  status: FactStatus;
  total_company_cost: number;
  document_id: string | null;
  superseded_at: string | null;
  superseded_by: string | null;
  created_at: string;
  created_by: string | null;
};

export type InsertEmployeePayrollFactDTO = {
  user_id: string;
  period_ym: string;
  settlement_type?: SettlementType;
  total_company_cost: number;
  document_id?: string | null;
  created_by?: string | null;
  settlement_hash?: string | null;
};

export type SupabasePayrollFactDatabase = {
  employee_payroll_facts: {
    Row: EmployeePayrollFactRow;
    Insert: Omit<EmployeePayrollFactRow, 'id' | 'created_at' | 'version' | 'status' | 'settlement_type' | 'document_id' | 'superseded_at' | 'superseded_by'> & {
      id?: string;
      created_at?: string;
      version?: number;
      status?: FactStatus;
      settlement_type?: SettlementType;
      document_id?: string | null;
      superseded_at?: string | null;
      superseded_by?: string | null;
    };
    Update: Partial<EmployeePayrollFactRow>;
  };
};
