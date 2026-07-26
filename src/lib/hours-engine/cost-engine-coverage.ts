/**
 * Matriz de cobertura Hours Engine → Overtime Cost Engine (Fase 1B).
 *
 * Regla: todo flujo vivo que recalcule horas debe persistir total_cost
 * vía persistOvertimeCostFromEngine / wrappers oficiales.
 *
 * RPCs parciales sin caller TS: no cablear; documentados aquí.
 */

export const COST_ENGINE_COVERAGE_MATRIX = [
  {
    flow: 'StaffDashboardView (fichaje in/out)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'syncOvertimeCostAfterTimeLogChange tras insert/update time_logs',
  },
  {
    flow: 'TimeTracker',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered_dead_code',
    notes: 'Persiste; sin imports activos en app (código muerto)',
  },
  {
    flow: 'overtime actions (config/logs/fichaje manager)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'recalcSnapshotsAndPersistOvertimeCost',
  },
  {
    flow: 'togglePaidStatus',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'Trigger SQL + recalcSnapshotsAndPersistOvertimeCost desde weekStart',
  },
  {
    flow: 'labor-conditions (updateLaborConditions)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'recalcSnapshotsAndPersistOvertimeCost',
  },
  {
    flow: 'recalculateAllBalances (UI)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'recalculateAllBalancesAndPersist',
  },
  {
    flow: 'cron semanal (cron_weekly_recalculate_balances_if_madrid_*)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes:
      'rpc horas + pg_net persist-only; refuerzo Vercel Cron full. Requiere app_settings.cron_recalc_bearer',
  },
  {
    flow: 'import-legacy (fichajes)',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'persistOvertimeCostForEmployees tras insert time_logs',
  },
  {
    flow: 'admin/import',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered',
    notes: 'persistOvertimeCostForEmployeesAction tras batches',
  },
  {
    flow: 'rpc_recalculate_user_balances_from_week',
    recalculatesHours: true,
    persistsMoney: false,
    status: 'no_ts_caller',
    notes: 'Sin consumidores TS; no implementar hasta exista caller',
  },
  {
    flow: 'rpc_recalculate_all_users_from_week',
    recalculatesHours: true,
    persistsMoney: false,
    status: 'no_ts_caller',
    notes: 'Sin consumidores TS; no implementar hasta exista caller',
  },
  {
    flow: 'rpc_recalculate_all_balances_from_week',
    recalculatesHours: true,
    persistsMoney: false,
    status: 'no_ts_caller',
    notes: 'Sin consumidores TS; no implementar hasta exista caller',
  },
  {
    flow: 'rpc_recalculate_all_balances',
    recalculatesHours: true,
    persistsMoney: true,
    status: 'covered_via_wrapper',
    notes:
      'Solo vía recalculateAllBalancesAndPersist / cron (nunca solo como fin de flujo vivo)',
  },
] as const;
