/**
 * Consulta agregada determinista: el total de horas extras no depende del
 * modelo de IA ni de llamadas a herramientas generadas por un tercero.
 * Usa el cliente de sesión del usuario y sus políticas RLS, nunca service_role.
 */
import type { createClient } from '@/utils/supabase/server';
import type { RoleName } from './permissions.ts';
import { resolveDates } from './knowledge-tools.ts';

type Client = Awaited<ReturnType<typeof createClient>>;
type WeekPeriod = 'semana_pasada' | 'esta_semana';
type WeekRange = { inicio: string; fin: string };
export type OvertimeTotalIntent = { matched: boolean; period: WeekPeriod | null };

function normalize(text: string): string {
  return text.toLocaleLowerCase('es').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function explicitPeriod(text: string): WeekPeriod | null {
  const t = normalize(text);
  if (/\b(?:semana pasada|semana anterior|ultima semana)\b/.test(t)) return 'semana_pasada';
  if (/\b(?:esta semana|semana actual)\b/.test(t)) return 'esta_semana';
  return null;
}

/** No interceptar peticiones por trabajador ni preguntas generales de RRHH. */
export function detectOvertimeTotalIntent(
  question: string,
  previousUserMessages: string[] = [],
): OvertimeTotalIntent {
  const q = normalize(question);
  const overtimeMatch = /\b(?:horas? extras?|horas? extraordinarias?)\b/.exec(q);
  const cost = /\b(?:coste|costo|costes|costos|importe|importes|total|gasto|euros|pagar|dinero|cuanto)\b/.test(q);
  const group = /\b(?:todos|todas|toda la plantilla|global|conjunto|plantilla|trabajadores|empleados|personal|equipo)\b/.test(q);
  const currentWeek = explicitPeriod(question);
  const previousOvertime = [...previousUserMessages.slice(-4)].reverse()
    .find(text => /\bhoras? extras?\b/.test(normalize(text))) ?? null;
  // Una continuación «de todos los trabajadores» hereda la consulta de coste,
  // pero nunca arrastra el contexto de un dominio ajeno.
  if (!overtimeMatch && group && q.length <= 60 && previousOvertime
      && /\b(?:coste|costo|costes|costos|importe|total|gasto|euros|pagar|dinero|cuanto)\b/.test(normalize(previousOvertime))) {
    return { matched: true, period: explicitPeriod(question) ?? explicitPeriod(previousOvertime) };
  }
  // «coste de horas extras de la semana pasada» sin nombre = total semanal;
  // «coste de horas extras de Silvia de la semana pasada» no es un agregado.
  const afterOvertime = overtimeMatch ? q.slice(overtimeMatch.index + overtimeMatch[0].length) : '';
  const namedPerson = /\b(?:de|del|para|correspondientes a)\s+(?!(?:la semana|esta semana|semana pasada|semana anterior)\b)[a-z]+\b/.test(afterOvertime);
  if (!overtimeMatch || !cost || !(group || (currentWeek && !namedPerson))) {
    return { matched: false, period: null };
  }
  const period = currentWeek
    ?? [...previousUserMessages.slice(-4)].reverse()
      .filter(text => /\b(?:horas? extras?|horas? extraordinarias?)\b/.test(normalize(text)))
      .map(explicitPeriod)
      .find((p): p is WeekPeriod => Boolean(p))
    ?? null;
  return { matched: true, period };
}

/** Desglose oficial por persona: se obtiene del mismo lote que alimenta el total. */
export type OvertimeWorkerBreakdown = {
  name: string;
  hours: number;
  costCents: number;
  bankHours: number;
};

export function detectOvertimeBreakdownIntent(
  question: string,
  previousUserMessages: string[] = [],
): OvertimeTotalIntent {
  const q = normalize(question);
  const historyAnchor = [...previousUserMessages.slice(-4)].reverse()
    .find(text => /\bhoras? (?:extras?|extraordinarias?)\b/.test(normalize(text))) ?? null;
  const continuation = /^(?:de )?(?:todos|todas)(?: los| las)? (?:trabajadores|empleados|personal|equipo)(?: de la plantilla)?[.!?]?$/.test(q)
    && Boolean(historyAnchor);
  const base = continuation ? normalize(historyAnchor!) : q;
  const overtime = /\bhoras? (?:extras?|extraordinarias?)\b/.exec(base);
  const breakdown = /\b(?:desglosa(?:me|r)?|desglose|detalle|detalla(?:me|r)?|lista(?:me|r)?|muestra(?:me|r)?|por trabajador|por empleado|por persona)\b/.test(base);
  const after = overtime ? base.slice(overtime.index + overtime[0].length) : '';
  const named = /\b(?:de|del|para)\s+(?!(?:esta|la|ultima|semana|todos|todas|cada|los|las|el|todo)\b)[a-z]{3,}\b/.test(after);
  if (!overtime || !breakdown || named) return { matched: false, period: null };
  const period = explicitPeriod(question) ?? explicitPeriod(base)
    ?? [...previousUserMessages.slice(-4)].reverse().map(explicitPeriod)
      .find((p): p is WeekPeriod => Boolean(p)) ?? null;
  return { matched: true, period };
}

export type OvertimeTotal = {
  workers?: OvertimeWorkerBreakdown[];
  dates: WeekRange;
  totalCostCents: number;
  totalExtraHours: number;
  employeesWithOvertime: number;
  employeesWithPositiveCost: number;
  bankHoursWithoutCost: number;
  snapshots: number;
  incompleteRows: number;
};
export type OvertimeTotalResult = { ok: true; summary: OvertimeTotal }
  | { ok: false; reason: 'forbidden' | 'invalid_period' | 'query_failed' | 'too_many_rows' | 'no_data' | 'invalid_values' };

export async function queryOvertimeTotal(
  ctx: { supabase: Client; role: RoleName; userId: string; today: string },
  period: WeekPeriod,
  includeBreakdown = false,
): Promise<OvertimeTotalResult> {
  // La RLS actual permite lectura de toda la plantilla solo al rol manager.
  // Admin sin esa política no debe recibir un subtotal engañoso de sus propias filas.
  if (!ctx.userId || ctx.role !== 'manager') {
    return { ok: false, reason: 'forbidden' };
  }
  const range = resolveDates({ periodo: period }, ctx.today);
  if ('error' in range) return { ok: false, reason: 'invalid_period' };
  const batchSize = 500;
  const maxRows = 10000;
  let totalCostCents = 0;
  let totalExtraHours = 0;
  let employeesWithPositiveCost = 0;
  let bankHoursWithoutCost = 0;
  let incompleteRows = 0;
  let snapshots = 0;
  const overtimeEmployees = new Set<string>();
  const workerTotals = new Map<string, { hours: number; costCents: number; bankHours: number }>();
  for (let offset = 0; offset <= maxRows; offset += batchSize) {
    const { data, error } = await ctx.supabase.from('weekly_snapshots')
      .select('user_id,week_start,extra_hours,total_cost,has_missing_rate,prefer_stock_effective')
      .gte('week_start', range.inicio).lte('week_start', range.fin)
      .order('week_start', { ascending: true })
      .order('user_id', { ascending: true })
      .range(offset, offset + batchSize - 1);
    if (error || !Array.isArray(data)) return { ok: false, reason: 'query_failed' };
    for (const r of data) {
      const hours = r.extra_hours === null ? 0 : Number(r.extra_hours);
      const cost = r.total_cost === null ? NaN : Number(r.total_cost);
      if (!Number.isFinite(hours) || !Number.isFinite(cost) || hours < 0) {
        // Un total de costes sin importes conocidos es potencialmente engañoso.
        if (hours > 0 || r.has_missing_rate) incompleteRows++;
        else return { ok: false, reason: 'invalid_values' };
        continue;
      }
      const cents = Math.round(cost * 100);
      if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(totalCostCents + cents)) {
        return { ok: false, reason: 'invalid_values' };
      }
      totalCostCents += cents;
      totalExtraHours += hours;
      if (hours > 0) overtimeEmployees.add(String(r.user_id));
      if (includeBreakdown && (hours > 0 || cents > 0)) {
        const id = String(r.user_id);
        const prior = workerTotals.get(id) ?? { hours: 0, costCents: 0, bankHours: 0 };
        prior.hours += hours;
        prior.costCents += cents;
        if (hours > 0 && cents === 0 && r.prefer_stock_effective === true) prior.bankHours += hours;
        workerTotals.set(id, prior);
      }
      if (cents > 0) employeesWithPositiveCost++;
      if (hours > 0 && cents === 0) {
        if (r.prefer_stock_effective === true) bankHoursWithoutCost += hours;
        else incompleteRows++;
      }
      if (r.has_missing_rate === true) incompleteRows++;
      snapshots++;
    }
    if (data.length < batchSize) {
      if (snapshots === 0 && incompleteRows === 0) return { ok: false, reason: 'no_data' };
      let workers: OvertimeWorkerBreakdown[] | undefined;
      if (includeBreakdown) {
        const ids = [...workerTotals.keys()];
        let names = new Map<string, string>();
        if (ids.length) {
          const { data: profiles, error: profilesError } = await ctx.supabase.from('profiles')
            .select('id,first_name,last_name').in('id', ids).limit(500);
          if (profilesError || !profiles || profiles.length !== ids.length) {
            return { ok: false, reason: 'query_failed' };
          }
          names = new Map(profiles.map(profile => [
            profile.id,
            [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim(),
          ]));
        }
        workers = ids.map(id => ({
          name: names.get(id) || 'Trabajador sin nombre',
          hours: Math.round(workerTotals.get(id)!.hours * 100) / 100,
          costCents: workerTotals.get(id)!.costCents,
          bankHours: Math.round(workerTotals.get(id)!.bankHours * 100) / 100,
        })).sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'es'));
      }
      return {
        ok: true,
        summary: {
          dates: range,
          workers,
          totalCostCents,
          totalExtraHours: Math.round(totalExtraHours * 100) / 100,
          employeesWithOvertime: overtimeEmployees.size,
          employeesWithPositiveCost,
          bankHoursWithoutCost: Math.round(bankHoursWithoutCost * 100) / 100,
          snapshots,
          incompleteRows,
        },
      };
    }
  }
  return { ok: false, reason: 'too_many_rows' };
}

export function formatOvertimeTotalAnswer(result: OvertimeTotalResult): string {
  if (!result.ok) {
    if (result.reason === 'forbidden') return 'No tienes permiso para consultar los costes de horas extras de toda la plantilla.';
    if (result.reason === 'invalid_period') return 'El periodo solicitado no es válido.';
    if (result.reason === 'no_data') return 'No existen registros semanales de horas extras para ese periodo. No puedo dar un total fiable.';
    return 'No he podido obtener el total completo de horas extras de los registros oficiales. No voy a calcular una cifra parcial como si fuera definitiva.';
  }
  const s = result.summary;
  const eur = (s.totalCostCents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hrs = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const date = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('es-ES', {
      timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
    });
  };
  const lines = [
    `Del ${date(s.dates.inicio)} al ${date(s.dates.fin)}, el ${s.incompleteRows ? 'coste registrado (parcial)' : 'coste total registrado'} de horas extras es de ${eur} €.`,
    `Horas extras: ${hrs(s.totalExtraHours)} h, de ${s.employeesWithOvertime} trabajadores. ${s.employeesWithPositiveCost} tienen importe positivo.`,
  ];
  if (s.bankHoursWithoutCost > 0) lines.push(`${hrs(s.bankHoursWithoutCost)} h están en bolsa de horas y no generan coste monetario.`);
  if (s.incompleteRows) lines.push(`Aviso: hay ${s.incompleteRows} registros con tarifa o importe pendiente. El total no es definitivo.`);
  return lines.join('\n');
}


/** Respuesta del detalle por empleados sin inferencia de un proveedor externo. */
export function formatOvertimeBreakdownAnswer(result: OvertimeTotalResult): string {
  const summary = formatOvertimeTotalAnswer(result);
  if (!result.ok) return summary;
  const workers = result.summary.workers;
  if (!workers) return 'El desglose nominal no está disponible. No voy a inventar nombres ni cifras.';
  if (!workers.length) return summary + '\nNo se registran horas extras individuales positivas en ese periodo.';
  const hours = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const money = (cents: number) => (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return summary + '\nDesglose por trabajador:\n' + workers.map(worker =>
    '• ' + worker.name + ' — ' + hours(worker.hours) + ' h — ' + money(worker.costCents) + ' €' +
    (worker.bankHours > 0 ? ' (' + hours(worker.bankHours) + ' h en bolsa)' : '')
  ).join('\n');
}
