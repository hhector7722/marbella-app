/**
 * Matriz Fase 1b: flujos vivos → Writer único (writeWeeklyProjection).
 * RPCs/SQL legacy: sin callers de producción para columnas C.
 */

export const COST_ENGINE_COVERAGE_MATRIX = [
  {
    flow: 'StaffDashboardView (fichaje in/out)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'syncOvertimeCostAfterTimeLogChange → writeProjectionFromWeek (Writer)',
  },
  {
    flow: 'TimeTracker',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered_dead_code',
    notes: 'syncOvertimeCostAfterTimeLogChange → Writer; sin imports activos en app',
  },
  {
    flow: 'overtime actions (config/logs/fichaje manager)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'writeProjectionFromWeek tras mutación B / time_logs',
  },
  {
    flow: 'togglePaidStatus',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'UPDATE B (is_paid) → writeProjectionFromWeek (toggle_paid)',
  },
  {
    flow: 'labor-conditions (updateLaborConditions)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'writeProjectionFromWeek tras cambio contractual',
  },
  {
    flow: 'recalculateAllBalances (UI)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'recalculateAllBalancesAndPersist → Writer',
  },
  {
    flow: 'cron semanal (pg_cron + Vercel)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes:
      'pg_cron solo HTTP Writer; Vercel /api/cron/recalculate-balances → Writer. Sin rpc_recalculate_all_balances',
  },
  {
    flow: 'import-legacy (fichajes)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'writeProjectionForEmployees tras insert time_logs',
  },
  {
    flow: 'admin/import',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'persistOvertimeCostForEmployeesAction → Writer',
  },
  {
    flow: 'rpc_recalculate_user_balances_from_week',
    recalculatesHours: true,
    persistsMoney: false,
    status: 'legacy_inert',
    notes: 'Sin callers TS/producción Fase 1b',
  },
  {
    flow: 'rpc_recalculate_all_users_from_week',
    recalculatesHours: true,
    persistsMoney: false,
    status: 'legacy_inert',
    notes: 'Sin callers TS/producción Fase 1b',
  },
  {
    flow: 'rpc_recalculate_all_balances_from_week',
    recalculatesHours: true,
    persistsMoney: false,
    status: 'legacy_inert',
    notes: 'Sin callers TS/producción Fase 1b',
  },
  {
    flow: 'rpc_recalculate_all_balances / fn_recalc',
    recalculatesHours: true,
    persistsMoney: false,
    status: 'legacy_inert',
    notes: 'Funciones conservadas; trigger/cron desconectados (migración phase1b)',
  },
] as const;
