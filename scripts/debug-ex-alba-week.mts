/**
 * TEMP DEBUG — seguir Ex. de Alba semana 2026-07-13.
 * Misma cadena que /staff/history → WeekCard (sin cambiar lógica de negocio).
 * Ejecutar: node --experimental-strip-types --env-file=.env.local scripts/debug-ex-alba-week.mts
 */
import { createClient } from '@supabase/supabase-js';
import {
  employeeFactsFromContractTerms,
  patchWeeksFromLiquidation,
  liquidateWeekForCard,
  type ContractTermRow,
} from '../src/lib/hours-engine/index.ts';

const ALBA = '97a9cb0d-f9c5-4a01-800e-a5a0bcde5848';
const WEEK = '2026-07-13';
const TAG = '[Ex.debug]';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(TAG, 'Faltan NEXT_PUBLIC_SUPABASE_URL / service role o anon key');
  process.exit(1);
}

const supabase = createClient(url, key);

function log(step: string, payload: unknown) {
  console.log(`\n${TAG} === ${step} ===`);
  console.log(JSON.stringify(payload, null, 2));
}

const { data: terms, error: termsErr } = await supabase
  .from('hours_contract_terms')
  .select(
    'effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour',
  )
  .eq('user_id', ALBA)
  .order('effective_from');

if (termsErr) throw termsErr;

const { data: profile, error: profileErr } = await supabase
  .from('profiles')
  .select('id, first_name, joining_date, end_date, contracted_hours_weekly')
  .eq('id', ALBA)
  .single();

if (profileErr) throw profileErr;

const employee = employeeFactsFromContractTerms(
  {
    id: profile.id,
    joining_date: profile.joining_date,
    end_date: profile.end_date,
  },
  (terms ?? []) as ContractTermRow[],
);

log('0. ruta esperada', {
  pantalla: '/staff/history (empleado Alba) → WeekCard',
  alternativa: '/dashboard/overtime o AdminDashboard → WorkerWeeklyHistoryModal',
  dashboardStaff: 'StaffDashboardView (si Alba abre su home)',
  weekStart: WEEK,
  userId: ALBA,
});

log('1. hours_contract_terms (hechos)', terms);
log('1b. profiles.contracted_hours_weekly (NO usado por motor)', {
  contracted_hours_weekly: profile.contracted_hours_weekly,
});

const { data: rpcWeeks, error: rpcErr } = await supabase.rpc('get_monthly_timesheet', {
  p_user_id: ALBA,
  p_year: 2026,
  p_month: 7,
});

if (rpcErr) throw rpcErr;

const rpcWeek = (rpcWeeks as any[] | null)?.find(
  (w) => String(w.startDate).split('T')[0] === WEEK,
);

log('2. RPC get_monthly_timesheet — semana', {
  startDate: rpcWeek?.startDate,
  summary: rpcWeek?.summary,
  daysExtraHoursFromRpc: (rpcWeek?.days ?? []).map((d: any) => ({
    date: d.date,
    totalHours: d.totalHours,
    extraHours: d.extraHours,
  })),
});

const { data: logs, error: logsErr } = await supabase
  .from('time_logs')
  .select('clock_in, clock_out, total_hours')
  .eq('user_id', ALBA)
  .gte('clock_in', '2026-07-12T22:00:00.000Z')
  .lte('clock_in', '2026-07-19T22:00:00.000Z')
  .order('clock_in');

if (logsErr) throw logsErr;

const engineLogs = (logs ?? []).map((l) => ({
  clockInIso: l.clock_in,
  clockOutIso: l.clock_out,
  totalHours: l.total_hours,
}));

log('3. time_logs (entrada motor)', engineLogs);

const { result, extrasByDay, summary } = liquidateWeekForCard({
  employee,
  weekStart: WEEK,
  logs: engineLogs,
  isPaid: rpcWeek?.summary?.isPaid === true,
  carryIn: 0,
});

log('4. LiquidationResult.dailyBreakdown', result.dailyBreakdown);
log('4b. LiquidationResult totales', {
  hoursWorked: result.hoursWorked,
  overtimeHours: result.overtimeHours,
  ordinaryHours: result.ordinaryHours,
  contractedHoursEffective: result.contractedHoursEffective,
  weeklyBalance_carry: result.weeklyBalance,
});
log('4c. extrasByDay (mapa que pisa day.extraHours)', extrasByDay);
log('4d. summary footer proyectado', summary);

const beforePatch = {
  startDate: WEEK,
  summary: { isPaid: rpcWeek?.summary?.isPaid ?? false },
  days: (rpcWeek?.days ?? []).map((d: any) => ({
    date: String(d.date).split('T')[0],
    extraHours: d.extraHours,
    totalHours: d.totalHours,
  })),
};

log('5. ANTES de patchWeeksFromLiquidation (extraHours = RPC)', beforePatch.days);

const patched = patchWeeksFromLiquidation([beforePatch], employee, engineLogs);
const after = patched[0]!;

log('6. DESPUÉS de patch (day.extraHours que recibe WeekCard)', after.days);
log('6b. footer summary que recibe WeekCard', after.summary);

const rendered = after.days.map((d) => {
  const raw = d.extraHours;
  const show = raw > 0.05;
  const fmt =
    !raw || Math.abs(raw) < 0.05
      ? '(vacío — no se pinta Ex)'
      : String(Math.round(raw * 2) / 2);
  return {
    date: d.date,
    day_extraHours_prop: raw,
    dailyBreakdown_overtimeHours: result.dailyBreakdown.days.find(
      (x) => x.day === d.date,
    )?.overtimeHours,
    rpc_extraHours: beforePatch.days.find((x) => x.date === d.date)?.extraHours,
    sePintaEnUI: show,
    textoRenderizado: show ? `Ex ${fmt}` : null,
    coincideConDailyBreakdown:
      raw ===
      (result.dailyBreakdown.days.find((x) => x.day === d.date)?.overtimeHours ??
        0),
    sustituidoRespectoRpc:
      raw !== (beforePatch.days.find((x) => x.date === d.date)?.extraHours ?? 0),
  };
});

log('7. VALOR FINAL QUE PINTA WeekCard (fmtHours(day.extraHours))', rendered);

log('8. VEREDICTO', {
  fuenteDelNumeroEnPantalla:
    'day.extraHours ← extrasByDay ← LiquidationResult.dailyBreakdown.overtimeHours',
  rpcExtraHoursSiempreCero: (rpcWeek?.days ?? []).every(
    (d: any) => Number(d.extraHours) === 0,
  ),
  footerEXTRAS: after.summary?.weeklyBalance,
  sumaExDiarias: after.days.reduce((a, d) => a + Number(d.extraHours), 0),
  motorOvertimeHours: result.overtimeHours,
  haySustitucionTrasDailyBreakdown: false,
  nota: 'Si la UI en ejecución muestra otro número, el build no está sirviendo este código o es otra ruta (StaffDashboardView).',
});
