/* eslint-disable @typescript-eslint/no-explicit-any -- Dobles de Supabase usados exclusivamente en pruebas */
/** Supabase fake mínimo para regresiones del calendario laboral. */
export function laborSupabaseFixture(seed: Record<string, Array<Record<string, any>>>) {
  return {
    from(table: string) {
      const conditions: Array<(row: Record<string, any>) => boolean> = [];
      const query: any = {
        select: () => query,
        eq: (col: string, val: any) => {
          conditions.push((r) => String(r[col]) === String(val)); return query;
        },
        gte: (col: string, val: any) => {
          conditions.push((r) => String(r[col]) >= String(val)); return query;
        },
        lte: (col: string, val: any) => {
          conditions.push((r) => String(r[col]) <= String(val)); return query;
        },
        in: (col: string, vals: any[]) => {
          conditions.push((r) => vals.includes(r[col])); return query;
        },
        or: () => query,
        order: () => query,
        maybeSingle: async () => ({ data: (seed[table] ?? []).filter(
          (r) => conditions.every((check) => check(r)),
        )[0] ?? null, error: null }),
        then: (resolve: any, reject: any) => Promise.resolve({
          data: (seed[table] ?? []).filter((r) => conditions.every((check) => check(r))),
          error: null,
        }).then(resolve, reject),
      };
      return query;
    },
  } as any;
}

export const payrollFixture = {
  employee_payroll_facts: [
    { id: 'fact_1', user_id: 'usr_active', period_ym: '2026-07', status: 'active', total_company_cost: 3100 },
    { id: 'fact_2', user_id: 'usr_hidden', period_ym: '2026-07', status: 'active', total_company_cost: 1000 },
  ],
  payroll_monthly_totals: [{
    period_ym: '2026-07', period_start: '2026-07-01', period_end: '2026-07-31',
    total_company_cost: 4100,
  }],
  profiles: [
    { id: 'usr_active', first_name: 'Trabajador', last_name: 'Activo', visible_in_plantilla: true, staffing_mode: 'regular' },
    { id: 'usr_hidden', first_name: 'Trabajador', last_name: 'Antiguo', visible_in_plantilla: false, staffing_mode: 'regular' },
  ],
  cash_closings: [
    { closing_date: '2026-07-15', net_sales: 1200 },
    { closing_date: '2026-07-15', net_sales: 300 },
  ],
  weekly_snapshots: [],
  weekly_snapshot_days: [],
  hours_contract_terms: [],
  time_logs: [],
};
