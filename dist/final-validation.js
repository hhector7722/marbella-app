// src/scripts/final-validation.ts
import { createClient } from "@supabase/supabase-js";

// src/lib/read-models/labor-cost-day-projector.ts
import { addDays, format, parseISO } from "date-fns";

// src/lib/payroll/value-objects.ts
function round2(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
var Money = class _Money {
  constructor(amount) {
    this._amount = round2(isNaN(amount) || !isFinite(amount) ? 0 : amount);
  }
  static from(amount) {
    return new _Money(amount);
  }
  static zero() {
    return new _Money(0);
  }
  get amount() {
    return this._amount;
  }
  add(other) {
    return new _Money(this._amount + other._amount);
  }
  subtract(other) {
    return new _Money(this._amount - other._amount);
  }
  multiply(factor) {
    return new _Money(this._amount * factor);
  }
  divide(divisor) {
    if (divisor === 0 || isNaN(divisor) || !isFinite(divisor)) {
      return _Money.zero();
    }
    return new _Money(this._amount / divisor);
  }
  equals(other) {
    return Math.abs(this._amount - other._amount) < 5e-3;
  }
  greaterThan(other) {
    return this._amount > other._amount + 5e-3;
  }
  isZero() {
    return Math.abs(this._amount) < 5e-3;
  }
};
var Percentage = class _Percentage {
  constructor(value) {
    this._value = round2(isNaN(value) || !isFinite(value) ? 0 : value);
  }
  static fromValues(numerator, denominator) {
    if (denominator.isZero() || denominator.amount <= 0) {
      return _Percentage.zero();
    }
    const pct = numerator.amount / denominator.amount * 100;
    return new _Percentage(pct);
  }
  static fromRaw(value) {
    return new _Percentage(value);
  }
  static zero() {
    return new _Percentage(0);
  }
  get value() {
    return this._value;
  }
};

// src/lib/madrid-date-bounds.ts
import { fromZonedTime } from "date-fns-tz";
function madridDayUtcRangeIso(yyyyMmDd) {
  const start = fromZonedTime(`${yyyyMmDd}T00:00:00.000`, "Europe/Madrid");
  const end = fromZonedTime(`${yyyyMmDd}T23:59:59.999`, "Europe/Madrid");
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
function madridRangeUtcIso(startYmd, endYmd) {
  const { startIso } = madridDayUtcRangeIso(startYmd);
  const { endIso } = madridDayUtcRangeIso(endYmd);
  return { startIso, endIso };
}
function formatYmdInMadrid(iso) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return "";
  return `${y}-${m}-${day}`;
}

// src/lib/hours-engine/marbella-round.ts
function roundMarbellaHours(hours) {
  const integerPart = Math.floor(hours);
  const decimalPart = hours - integerPart;
  const minutes = decimalPart * 60;
  let fraction = 0;
  if (minutes <= 20) {
    fraction = 0;
  } else if (minutes <= 50) {
    fraction = 0.5;
  } else {
    fraction = 1;
  }
  return integerPart + fraction;
}
function roundMarbellaSigned(hours) {
  if (!Number.isFinite(hours) || hours === 0) return 0;
  const sign = hours < 0 ? -1 : 1;
  return sign * roundMarbellaHours(Math.abs(hours));
}

// src/lib/hours-engine/week-dates.ts
function civilDateToParts(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) {
    throw new Error(`Fecha civil inv\xE1lida: ${ymd}`);
  }
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}
function partsToCivilDate(y, m, d) {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}
function compareCivilDate(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
function isCivilDateInRange(day, from, to) {
  if (compareCivilDate(day, from) < 0) return false;
  if (to !== null && compareCivilDate(day, to) > 0) return false;
  return true;
}
function addCivilDays(ymd, delta) {
  const { y, m, d } = civilDateToParts(ymd);
  const dt = new Date(y, m - 1, d + delta);
  return partsToCivilDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}
function assertMonday(weekStart) {
  const { y, m, d } = civilDateToParts(weekStart);
  const dt = new Date(y, m - 1, d);
  if (dt.getDay() !== 1) {
    throw new Error(`weekStart debe ser lunes: ${weekStart}`);
  }
}
function weekBounds(weekStart) {
  assertMonday(weekStart);
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(addCivilDays(weekStart, i));
  }
  return { weekStart, weekEnd: days[6], days };
}
function mondayOnOrBefore(day) {
  const { y, m, d } = civilDateToParts(day);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  return addCivilDays(day, delta);
}
function nextWeekStart(weekStart) {
  return addCivilDays(weekStart, 7);
}
function previousWeekStart(weekStart) {
  return addCivilDays(weekStart, -7);
}

// src/lib/hours-engine/attendance-aggregator.ts
function hoursFromLog(log) {
  if (log.totalHours != null && Number.isFinite(log.totalHours)) {
    return log.totalHours;
  }
  if (!log.clockOutIso) return 0;
  const start = new Date(log.clockInIso);
  const end = new Date(log.clockOutIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const raw = (end.getTime() - start.getTime()) / (1e3 * 60 * 60);
  if (raw <= 0) return 0;
  return roundMarbellaHours(raw);
}
function aggregateWeekAttendance(employee, weekStart, logs) {
  const { weekEnd, days } = weekBounds(weekStart);
  const daySet = new Set(days);
  const hoursByDay = {};
  for (const d of days) hoursByDay[d] = 0;
  for (const log of logs) {
    const day = formatYmdInMadrid(log.clockInIso);
    if (!day || !daySet.has(day)) continue;
    hoursByDay[day] = (hoursByDay[day] ?? 0) + hoursFromLog(log);
  }
  const attendanceDays = days.map((day) => ({
    day,
    hours: hoursByDay[day] ?? 0
  }));
  const totalHours = attendanceDays.reduce((acc, d) => acc + d.hours, 0);
  return {
    weekStart,
    weekEnd,
    hoursByDay,
    days: attendanceDays,
    totalHours
  };
}

// src/lib/hours-engine/contract-resolver.ts
function findTermForDay(day, terms) {
  const matches = terms.filter(
    (t) => isCivilDateInRange(day, t.effectiveFrom, t.effectiveTo)
  );
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(
      `Tramos solapados en ${day}: invariante de hechos rota (debe haber como m\xE1ximo un tramo).`
    );
  }
  return matches[0];
}
function getFirstTermDate(terms) {
  let first = null;
  for (const t of terms) {
    if (first === null || compareCivilDate(t.effectiveFrom, first) < 0) {
      first = t.effectiveFrom;
    }
  }
  return first;
}
function segmentKey(term, kind) {
  if (kind === "pre_alta" || kind === "gap") return kind;
  if (!term) return "none";
  return `term:${term.effectiveFrom}:${term.effectiveTo ?? "open"}:${term.weeklyHours}:${term.bagMode}:${term.regime}`;
}
function resolveEffectiveContract(employee, weekStart) {
  const { weekEnd, days } = weekBounds(weekStart);
  const { terms } = employee;
  const firstTermDate = getFirstTermDate(terms);
  const groups = [];
  let current = null;
  for (const day of days) {
    const term = findTermForDay(day, terms);
    if (!term) {
      const kind = firstTermDate === null || compareCivilDate(day, firstTermDate) < 0 ? "pre_alta" : "gap";
      const key2 = segmentKey(null, kind);
      if (!current || segmentKey(current.term, current.kind) !== key2) {
        current = { kind, term: null, days: [day] };
        groups.push(current);
      } else {
        current.days.push(day);
      }
      continue;
    }
    const key = segmentKey(term, "term");
    if (!current || segmentKey(current.term, current.kind) !== key) {
      current = { kind: "term", term, days: [day] };
      groups.push(current);
    } else {
      current.days.push(day);
    }
  }
  const segments = groups.map((g) => {
    if (g.kind === "pre_alta" || g.kind === "gap") {
      return {
        days: g.days,
        weeklyHoursOfTerm: 0,
        contractedHours: 0,
        bagMode: false,
        termRegime: "staff",
        overtimeRatePerHour: null,
        kind: g.kind,
        effectiveFrom: null,
        effectiveTo: null
      };
    }
    const term = g.term;
    const contractedHours = roundMarbellaHours(
      g.days.length / 7 * term.weeklyHours
    );
    return {
      days: g.days,
      weeklyHoursOfTerm: term.weeklyHours,
      contractedHours,
      bagMode: term.bagMode,
      termRegime: term.regime,
      overtimeRatePerHour: term.overtimeRatePerHour ?? null,
      kind: "term",
      effectiveFrom: term.effectiveFrom,
      effectiveTo: term.effectiveTo
    };
  });
  const contractedHoursEffective = segments.filter((s) => s.kind === "term").reduce((acc, s) => acc + s.contractedHours, 0);
  return {
    weekStart,
    weekEnd,
    contractedHoursEffective,
    segments
  };
}
function resolveEffectiveOvertimeRate(employee, weekStart, overrideRate) {
  if (overrideRate != null) return overrideRate;
  const contract = resolveEffectiveContract(employee, weekStart);
  for (const s of contract.segments) {
    if (!s.days.includes(weekStart)) continue;
    if (s.overtimeRatePerHour != null && Number.isFinite(s.overtimeRatePerHour)) {
      return Number(s.overtimeRatePerHour);
    }
    break;
  }
  for (const s of contract.segments) {
    if (s.kind === "term" && s.overtimeRatePerHour != null && Number.isFinite(s.overtimeRatePerHour)) {
      return Number(s.overtimeRatePerHour);
    }
  }
  const sortedTerms = [...employee.terms].sort(
    (a, b) => compareCivilDate(b.effectiveFrom, a.effectiveFrom)
  );
  for (const t of sortedTerms) {
    if (compareCivilDate(t.effectiveFrom, weekStart) <= 0 && t.overtimeRatePerHour != null && Number.isFinite(t.overtimeRatePerHour)) {
      return Number(t.overtimeRatePerHour);
    }
  }
  for (const t of sortedTerms) {
    if (t.overtimeRatePerHour != null && Number.isFinite(t.overtimeRatePerHour)) {
      return Number(t.overtimeRatePerHour);
    }
  }
  return null;
}

// src/lib/hours-engine/carry-engine.ts
function computeCarry(input) {
  const carryIn = roundMarbellaSigned(input.carryIn);
  const parts = input.parts.map((p) => ({
    ...p,
    weeklyBalancePart: roundMarbellaSigned(p.weeklyBalancePart)
  }));
  const weeklyBalance = roundMarbellaSigned(
    parts.reduce((acc, p) => acc + p.weeklyBalancePart, 0)
  );
  const balanceFinal = roundMarbellaSigned(carryIn + weeklyBalance);
  const bagPositive = roundMarbellaSigned(
    parts.filter((p) => p.bagMode).reduce((acc, p) => acc + Math.max(0, p.weeklyBalancePart), 0)
  );
  const allBag = parts.length > 0 && parts.every((p) => p.bagMode);
  const allPay = parts.length > 0 && parts.every((p) => !p.bagMode);
  let carryOut;
  if (input.isPaid) {
    carryOut = Math.min(0, balanceFinal);
  } else if (balanceFinal <= 0) {
    carryOut = balanceFinal;
  } else if (parts.length === 0) {
    carryOut = balanceFinal;
  } else if (allPay) {
    carryOut = 0;
  } else if (allBag) {
    carryOut = balanceFinal;
  } else {
    const priorCredit = Math.max(0, carryIn);
    carryOut = Math.min(balanceFinal, priorCredit + bagPositive);
  }
  return {
    carryIn,
    weeklyBalance,
    balanceFinal,
    carryOut: roundMarbellaSigned(carryOut)
  };
}

// src/lib/hours-engine/daily-breakdown.ts
function isAllOvertimeRegime(regime) {
  return regime === "pre_alta" || regime === "gap" || regime === "manager" || regime === "fixed";
}
function attributeRunningStaff(days, hoursByDay, ordinaryCap, out) {
  let accumulated = 0;
  for (const day of days) {
    const hours = hoursByDay[day] ?? 0;
    let ordinaryHours = 0;
    let overtimeHours = 0;
    if (hours > 0) {
      if (accumulated >= ordinaryCap) {
        overtimeHours = hours;
      } else if (accumulated + hours > ordinaryCap) {
        overtimeHours = accumulated + hours - ordinaryCap;
        ordinaryHours = hours - overtimeHours;
      } else {
        ordinaryHours = hours;
      }
      accumulated += hours;
    }
    out.set(day, { day, hours, ordinaryHours, overtimeHours });
  }
}
function attributeAllOvertime(days, hoursByDay, out) {
  for (const day of days) {
    const hours = hoursByDay[day] ?? 0;
    out.set(day, {
      day,
      hours,
      ordinaryHours: 0,
      overtimeHours: hours
    });
  }
}
function buildDailyBreakdown(weekStart, hoursByDay, segments) {
  const { days: weekDays } = weekBounds(weekStart);
  const byDay = /* @__PURE__ */ new Map();
  for (const day of weekDays) {
    byDay.set(day, {
      day,
      hours: hoursByDay[day] ?? 0,
      ordinaryHours: 0,
      overtimeHours: 0
    });
  }
  for (const seg of segments) {
    if (seg.days.length === 0) continue;
    let regime = seg.termRegime;
    if (seg.kind === "pre_alta") regime = "pre_alta";
    if (seg.kind === "gap") regime = "gap";
    if (isAllOvertimeRegime(regime)) {
      attributeAllOvertime(seg.days, hoursByDay, byDay);
    } else {
      attributeRunningStaff(seg.days, hoursByDay, seg.contractedHours, byDay);
    }
  }
  const days = weekDays.map((d) => byDay.get(d));
  const ordinaryHoursTotal = days.reduce((a, d) => a + d.ordinaryHours, 0);
  const overtimeHoursTotal = days.reduce((a, d) => a + d.overtimeHours, 0);
  return { days, ordinaryHoursTotal, overtimeHoursTotal };
}

// src/lib/hours-engine/regime-policy.ts
function hoursOnDays(days, hoursByDay) {
  return days.reduce((acc, d) => acc + (hoursByDay[d] ?? 0), 0);
}
function balanceForRegime(regime, hours, contractedHours) {
  if (regime === "staff") {
    const weeklyBalancePart = hours - contractedHours;
    const ordinaryHours = Math.min(hours, contractedHours);
    const overtimeHours = Math.max(0, hours - contractedHours);
    return { weeklyBalancePart, ordinaryHours, overtimeHours, contractedHours };
  }
  return {
    weeklyBalancePart: hours,
    ordinaryHours: 0,
    overtimeHours: hours,
    contractedHours
  };
}
function applyRegimeToSegment(input) {
  const { days, hoursByDay, contractedHours, bagMode, termRegime, kind } = input;
  let regimeApplied = termRegime;
  if (kind === "pre_alta") regimeApplied = "pre_alta";
  if (kind === "gap") regimeApplied = "gap";
  if (days.length === 0) {
    return {
      days,
      hoursWorked: 0,
      contractedHours: 0,
      bagMode,
      regimeApplied,
      weeklyBalancePart: 0,
      ordinaryHours: 0,
      overtimeHours: 0,
      kind
    };
  }
  const hoursWorked = hoursOnDays(days, hoursByDay);
  const part = balanceForRegime(regimeApplied, hoursWorked, contractedHours);
  return {
    days,
    hoursWorked,
    contractedHours,
    bagMode,
    regimeApplied,
    weeklyBalancePart: roundMarbellaSigned(part.weeklyBalancePart),
    ordinaryHours: part.ordinaryHours,
    overtimeHours: part.overtimeHours,
    kind
  };
}

// src/lib/hours-engine/liquidation-engine.ts
var EPS = 1e-9;
function emptyDailyBreakdown(weekStart) {
  return buildDailyBreakdown(weekStart, {}, []);
}
function assertDailyCoherent(overtimeHours, ordinaryHours, daily) {
  const dOt = roundMarbellaHours(daily.overtimeHoursTotal);
  const wOt = roundMarbellaHours(overtimeHours);
  if (Math.abs(dOt - wOt) > EPS) {
    throw new Error(
      `Invariante roto: \u03A3 extras diarias (${daily.overtimeHoursTotal}) \u2260 extras semanales (${overtimeHours})`
    );
  }
  const dOrd = roundMarbellaHours(daily.ordinaryHoursTotal);
  const wOrd = roundMarbellaHours(ordinaryHours);
  if (Math.abs(dOrd - wOrd) > EPS) {
    throw new Error(
      `Invariante roto: \u03A3 ordinarias diarias (${daily.ordinaryHoursTotal}) \u2260 ordinarias semanales (${ordinaryHours})`
    );
  }
}
function liquidateWeek(input) {
  const { employee, weekStart, logs, isPaid, carryIn, bagModeOverride } = input;
  const { weekEnd } = weekBounds(weekStart);
  const resolveBag = (bagMode) => bagModeOverride === true || bagModeOverride === false ? bagModeOverride : bagMode;
  const attendance = aggregateWeekAttendance(employee, weekStart, logs);
  const contract = resolveEffectiveContract(employee, weekStart);
  const segmentInputs = contract.segments.map((seg) => ({
    ...seg,
    bagMode: resolveBag(seg.bagMode)
  }));
  if (segmentInputs.length === 0) {
    const carry2 = computeCarry({
      carryIn,
      parts: bagModeOverride === true || bagModeOverride === false ? [{ weeklyBalancePart: 0, bagMode: bagModeOverride }] : [],
      isPaid
    });
    const dailyBreakdown2 = emptyDailyBreakdown(weekStart);
    return {
      employeeId: employee.employeeId,
      weekStart,
      weekEnd,
      hoursWorked: 0,
      contractedHoursEffective: contract.contractedHoursEffective,
      weeklyBalance: 0,
      carryIn: carry2.carryIn,
      balanceFinal: carry2.balanceFinal,
      carryOut: carry2.carryOut,
      isPaid,
      ordinaryHours: 0,
      overtimeHours: 0,
      segments: [],
      dailyBreakdown: dailyBreakdown2
    };
  }
  const segments = segmentInputs.map(
    (seg) => applyRegimeToSegment({
      days: seg.days,
      hoursByDay: attendance.hoursByDay,
      contractedHours: seg.contractedHours,
      bagMode: seg.bagMode,
      termRegime: seg.termRegime,
      kind: seg.kind
    })
  );
  const carry = computeCarry({
    carryIn,
    parts: segments.map((s) => ({
      weeklyBalancePart: s.weeklyBalancePart,
      bagMode: s.bagMode
    })),
    isPaid
  });
  const ordinaryHours = segments.reduce((acc, s) => acc + s.ordinaryHours, 0);
  const overtimeHours = segments.reduce((acc, s) => acc + s.overtimeHours, 0);
  const dailyBreakdown = buildDailyBreakdown(
    weekStart,
    attendance.hoursByDay,
    segmentInputs.map((seg) => ({
      days: seg.days,
      hoursByDay: attendance.hoursByDay,
      contractedHours: seg.contractedHours,
      termRegime: seg.termRegime,
      kind: seg.kind
    }))
  );
  assertDailyCoherent(overtimeHours, ordinaryHours, dailyBreakdown);
  return {
    employeeId: employee.employeeId,
    weekStart,
    weekEnd,
    hoursWorked: attendance.totalHours,
    contractedHoursEffective: contract.contractedHoursEffective,
    weeklyBalance: carry.weeklyBalance,
    carryIn: carry.carryIn,
    balanceFinal: carry.balanceFinal,
    carryOut: carry.carryOut,
    isPaid,
    ordinaryHours,
    overtimeHours,
    segments,
    dailyBreakdown
  };
}

// src/lib/hours-engine/overtime-cost-engine.ts
var EPS2 = 1e-9;
var MissingOvertimeRateError = class extends Error {
  constructor(message) {
    super(message ?? "Overtime Cost Engine: falta tarifa de horas extra");
    this.code = "MISSING_OVERTIME_RATE";
    this.name = "MissingOvertimeRateError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
function finiteRate(rate) {
  if (rate == null || !Number.isFinite(rate)) return null;
  return Number(rate);
}
function priceWeekOvertime(input) {
  const netPayable = roundMarbellaHours(Math.max(0, input.netPayableHours));
  const rate = finiteRate(input.effectiveOvertimeRate);
  if (netPayable <= EPS2) {
    return { estimatedValue: 0, hourlyRate: rate ?? 0 };
  }
  if (rate == null) {
    throw new MissingOvertimeRateError(
      "Overtime Cost Engine: falta tarifa de horas extra para semana con horas cobrables"
    );
  }
  const estimatedValue = netPayable * rate;
  return { estimatedValue, hourlyRate: rate };
}

// src/lib/hours-engine/week-card-from-liquidation.ts
function extrasByDayFromResult(result) {
  const out = {};
  for (const d of result.dailyBreakdown.days) {
    out[d.day] = d.overtimeHours;
  }
  return out;
}
function netPayableHoursFromLiquidation(result, bagModeOverride) {
  const preferStock = bagModeOverride === true ? true : bagModeOverride === false ? false : result.segments.length > 0 && result.segments.every((s) => s.bagMode);
  if (preferStock) return 0;
  return roundMarbellaHours(
    Math.max(0, result.balanceFinal - Math.max(0, result.carryOut))
  );
}
function priceLiquidationOvertime(result, employee, options) {
  const netPayableHours = netPayableHoursFromLiquidation(
    result,
    options?.bagModeOverride
  );
  const effectiveOvertimeRate = resolveEffectiveOvertimeRate(
    employee,
    result.weekStart,
    options?.overrideRate
  );
  try {
    return priceWeekOvertime({
      netPayableHours,
      effectiveOvertimeRate
    });
  } catch (err) {
    if (err instanceof MissingOvertimeRateError) {
      return { estimatedValue: null, hourlyRate: null, hasMissingRate: true };
    }
    throw err;
  }
}
function weekCardSummaryFromLiquidation(result, pricing, bagModeOverride) {
  const preferStock = bagModeOverride === true ? true : bagModeOverride === false ? false : result.segments.length > 0 && result.segments.every((s) => s.bagMode);
  const netPayable = netPayableHoursFromLiquidation(result, bagModeOverride);
  const extrasFooter = result.carryOut < 0 ? 0 : preferStock ? roundMarbellaHours(result.overtimeHours) : roundMarbellaHours(Math.max(0, netPayable - Math.max(0, result.carryIn)));
  return {
    totalHours: result.hoursWorked,
    startBalance: result.carryIn,
    weeklyBalance: extrasFooter,
    finalBalance: result.balanceFinal,
    estimatedValue: pricing.estimatedValue,
    isPaid: result.isPaid,
    preferStock,
    limitHours: result.contractedHoursEffective,
    hourlyRate: pricing.hourlyRate,
    hasMissingRate: pricing.hasMissingRate
  };
}
function assertCardMatchesLiquidation(summary, result, employee, options) {
  const eps = 1e-9;
  if (Math.abs(summary.totalHours - result.hoursWorked) > eps) {
    throw new Error("Footer HORAS \u2260 hoursWorked");
  }
  if (Math.abs(summary.startBalance - result.carryIn) > eps) {
    throw new Error("Footer PENDIENTES \u2260 carryIn");
  }
  const pricing = priceLiquidationOvertime(result, employee, options);
  if (summary.estimatedValue != null && pricing.estimatedValue != null && Math.abs(summary.estimatedValue - pricing.estimatedValue) > eps) {
    throw new Error("Footer IMPORTE \u2260 Overtime Cost Engine");
  }
  if (summary.hourlyRate != null && pricing.hourlyRate != null && Math.abs(summary.hourlyRate - pricing.hourlyRate) > eps) {
    throw new Error("Footer hourlyRate \u2260 Overtime Cost Engine");
  }
  if (summary.estimatedValue != null && result.carryOut < -eps && summary.estimatedValue > eps) {
    throw new Error("IMPORTE > 0 con carryOut negativo (deuda)");
  }
  if (result.carryOut < -eps && summary.weeklyBalance > eps) {
    throw new Error("EXTRAS > 0 con carryOut negativo (deuda)");
  }
}
function liquidateWeekForCard(input) {
  const result = liquidateWeek({
    employee: input.employee,
    weekStart: input.weekStart,
    logs: input.logs,
    isPaid: input.isPaid ?? false,
    carryIn: input.carryIn,
    bagModeOverride: input.bagModeOverride
  });
  const pricing = priceLiquidationOvertime(result, input.employee, {
    bagModeOverride: input.bagModeOverride,
    overrideRate: input.overrideRate
  });
  const summary = weekCardSummaryFromLiquidation(
    result,
    pricing,
    input.bagModeOverride
  );
  assertCardMatchesLiquidation(summary, result, input.employee, {
    bagModeOverride: input.bagModeOverride,
    overrideRate: input.overrideRate
  });
  return {
    result,
    extrasByDay: extrasByDayFromResult(result),
    summary
  };
}

// src/lib/hours-engine/ui-bridge.ts
function mapContractTermRows(rows) {
  return rows.map((r) => {
    const regime = r.regime;
    if (regime !== "staff" && regime !== "manager" && regime !== "fixed") {
      throw new Error(`R\xE9gimen de tramo inv\xE1lido: ${r.regime}`);
    }
    return {
      effectiveFrom: r.effective_from.split("T")[0],
      effectiveTo: r.effective_to ? r.effective_to.split("T")[0] : null,
      weeklyHours: Number(r.weekly_hours),
      bagMode: !!r.bag_mode,
      regime,
      overtimeRatePerHour: r.overtime_rate_per_hour == null ? null : Number(r.overtime_rate_per_hour)
    };
  });
}
function employeeFactsFromContractTerms(boundary, termRows) {
  const terms = mapContractTermRows(termRows);
  assertTermsNonOverlapping(terms);
  return {
    employeeId: boundary.id,
    joiningDate: boundary.joining_date ? boundary.joining_date.split("T")[0] : null,
    endDate: boundary.end_date ? boundary.end_date.split("T")[0] : null,
    terms
  };
}
function assertTermsNonOverlapping(terms) {
  const sorted = [...terms].sort(
    (a, b) => compareCivilDate(a.effectiveFrom, b.effectiveFrom)
  );
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const aEnd = a.effectiveTo;
      if (aEnd === null) {
        throw new Error(
          `Tramo abierto ${a.effectiveFrom} solapa con ${b.effectiveFrom}`
        );
      }
      if (compareCivilDate(b.effectiveFrom, aEnd) <= 0) {
        throw new Error(
          `Tramos solapados: ${a.effectiveFrom}..${aEnd} \u2229 ${b.effectiveFrom}..${b.effectiveTo ?? "open"}`
        );
      }
    }
  }
}

// src/lib/hours-engine/load-employee-facts.ts
async function loadEmployeeBoundaryFacts(supabase, userId) {
  const [boundaryRes, termsRes] = await Promise.all([
    supabase.from("profiles").select("joining_date, end_date").eq("id", userId).maybeSingle(),
    supabase.from("hours_contract_terms").select(
      "effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour"
    ).eq("user_id", userId).order("effective_from", { ascending: true })
  ]);
  if (boundaryRes.error) {
    throw new Error(`No se pudo cargar frontera laboral: ${boundaryRes.error.message}`);
  }
  if (termsRes.error) {
    throw new Error(`No se pudieron cargar tramos contractuales: ${termsRes.error.message}`);
  }
  const boundary = boundaryRes.data ?? {
    joining_date: null,
    end_date: null
  };
  const rows = termsRes.data ?? [];
  if (rows.length === 0) {
    throw new Error(
      `Empleado ${userId} sin tramos en hours_contract_terms. Ejecutar seed/migraci\xF3n.`
    );
  }
  return employeeFactsFromContractTerms(
    {
      id: userId,
      joining_date: boundary.joining_date,
      end_date: boundary.end_date
    },
    rows
  );
}

// src/lib/hours-engine/opening-carry.ts
function employeeTimelineStartWeek(employee) {
  const candidates = [];
  if (employee.joiningDate) {
    candidates.push(employee.joiningDate.split("T")[0]);
  }
  for (const t of employee.terms) {
    candidates.push(t.effectiveFrom.split("T")[0]);
  }
  if (candidates.length === 0) return null;
  candidates.sort(compareCivilDate);
  return mondayOnOrBefore(candidates[0]);
}
function logsInWeek(logs, weekStart) {
  const daySet = new Set(weekBounds(weekStart).days);
  return logs.filter((l) => {
    const day = formatYmdInMadrid(l.clockInIso);
    return day != null && daySet.has(day);
  });
}
function resolveOpeningCarryIn(input) {
  assertMonday(input.chainStart);
  const timelineStart = employeeTimelineStartWeek(input.employee);
  if (timelineStart == null) return 0;
  const prev = previousWeekStart(input.chainStart);
  if (compareCivilDate(prev, timelineStart) < 0) return 0;
  let carryIn = 0;
  for (let weekStart = timelineStart; compareCivilDate(weekStart, input.chainStart) < 0; weekStart = nextWeekStart(weekStart)) {
    const result = liquidateWeek({
      employee: input.employee,
      weekStart,
      logs: logsInWeek(input.logs, weekStart),
      isPaid: input.isPaidByWeek(weekStart),
      carryIn,
      bagModeOverride: input.bagModeOverrideByWeek?.(weekStart) ?? null
    });
    carryIn = result.carryOut;
  }
  return carryIn;
}
function isPaidLookupFromRows(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const key = typeof r.week_start === "string" ? r.week_start.split("T")[0] : String(r.week_start);
    map.set(key, r.is_paid === true);
  }
  return (weekStart) => map.get(weekStart) === true;
}
function bagModeOverrideLookupFromRows(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.prefer_stock_hours_override !== true && r.prefer_stock_hours_override !== false) {
      continue;
    }
    const key = typeof r.week_start === "string" ? r.week_start.split("T")[0] : String(r.week_start);
    map.set(key, r.prefer_stock_hours_override);
  }
  return (weekStart) => map.get(weekStart) ?? null;
}
function overtimeRateOverrideLookupFromRows(rows) {
  const map = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (r.overtime_price_snapshot == null) continue;
    const n = Number(r.overtime_price_snapshot);
    if (!Number.isFinite(n)) continue;
    const key = typeof r.week_start === "string" ? r.week_start.split("T")[0] : String(r.week_start);
    map.set(key, n);
  }
  return (weekStart) => map.get(weekStart) ?? null;
}

// src/lib/staff/plantilla-employees.ts
var HIDDEN_PLANTILLA_FIRST_NAMES = /* @__PURE__ */ new Set(["ramon", "ram\xF3n", "empleado"]);
var PLANTILLA_EMPLOYEE_SELECT = "id, first_name, last_name, avatar_url";
function isHiddenPlantillaName(firstName) {
  const name = (firstName || "").trim().toLowerCase();
  return HIDDEN_PLANTILLA_FIRST_NAMES.has(name);
}
function isVisibleInEmployeeSelectors(profile) {
  if (isHiddenPlantillaName(profile.first_name)) return false;
  return profile.visible_in_plantilla !== false;
}
function filterVisiblePlantillaEmployees(employees) {
  return employees.filter(isVisibleInEmployeeSelectors);
}

// src/lib/read-models/labor-cost-day-projector.ts
function mondayOf(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + delta);
  return format(dt, "yyyy-MM-dd");
}
var LaborCostDayReadModelProjector = class {
  constructor(supabase, allocationService, contractTermsService, payrollRepo) {
    this.supabase = supabase;
    this.allocationService = allocationService;
    this.contractTermsService = contractTermsService;
    this.payrollRepo = payrollRepo;
  }
  /**
   * Proyecta el detalle diario del coste laboral para una fecha.
   */
  async projectDayDetail(dateYmd, options) {
    const day = dateYmd.split("T")[0];
    const periodYm = day.substring(0, 7);
    const includeAll = options?.includeAllContracted ?? false;
    const weekStart = mondayOf(day);
    const weekEnd = format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);
    const isPayrollPending = activeFacts.length === 0;
    let netSalesMoney = Money.zero();
    const { data: salesData } = await this.supabase.from("daily_sales").select("total_net_amount").eq("date", day).maybeSingle();
    if (salesData && salesData.total_net_amount) {
      netSalesMoney = Money.from(Number(salesData.total_net_amount));
    }
    let profilesQuery = this.supabase.from("profiles").select(PLANTILLA_EMPLOYEE_SELECT);
    if (options?.userId) {
      profilesQuery = profilesQuery.eq("id", options.userId);
    }
    const { data: profileRows } = await profilesQuery;
    const profiles = filterVisiblePlantillaEmployees(profileRows ?? []);
    const workerDTOs = [];
    let summaryFixed = Money.zero();
    let summaryOvertime = Money.zero();
    for (const profile of profiles) {
      const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "\u2014";
      const hasActiveContract = await this.contractTermsService.isContractActiveOn(
        profile.id,
        day
      );
      let overtimeMoney = Money.zero();
      let hasClockIns = false;
      try {
        const employee = await loadEmployeeBoundaryFacts(this.supabase, profile.id);
        const timelineStart = employeeTimelineStartWeek(employee);
        const logsFromYmd = timelineStart && timelineStart < weekStart ? timelineStart : weekStart;
        const { startIso, endIso } = madridRangeUtcIso(logsFromYmd, weekEnd);
        const [snapsRes, logsRes] = await Promise.all([
          this.supabase.from("weekly_snapshots").select("week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot").eq("user_id", profile.id).gte("week_start", logsFromYmd).lte("week_start", weekStart),
          this.supabase.from("time_logs").select("clock_in, clock_out, total_hours").eq("user_id", profile.id).gte("clock_in", startIso).lte("clock_in", endIso)
        ]);
        const engineLogs = (logsRes.data ?? []).map((l) => ({
          clockInIso: l.clock_in,
          clockOutIso: l.clock_out,
          totalHours: l.total_hours
        }));
        hasClockIns = engineLogs.some((l) => formatYmdInMadrid(l.clockInIso) === day);
        if (!snapsRes.error && !logsRes.error) {
          const isPaidByWeek = isPaidLookupFromRows(snapsRes.data ?? []);
          const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(snapsRes.data ?? []);
          const overtimeRateOverrideByWeek = overtimeRateOverrideLookupFromRows(snapsRes.data ?? []);
          const carryIn = resolveOpeningCarryIn({
            employee,
            chainStart: weekStart,
            logs: engineLogs,
            isPaidByWeek,
            bagModeOverrideByWeek
          });
          const weekLogs = engineLogs.filter((l) => {
            const d = formatYmdInMadrid(l.clockInIso);
            return d >= weekStart && d <= weekEnd;
          });
          const { extrasByDay, summary } = liquidateWeekForCard({
            employee,
            weekStart,
            logs: weekLogs,
            isPaid: isPaidByWeek(weekStart),
            carryIn,
            bagModeOverride: bagModeOverrideByWeek(weekStart),
            overrideRate: overtimeRateOverrideByWeek(weekStart)
          });
          const dayOtShare = extrasByDay[day] ?? 0;
          if (Math.abs(dayOtShare) >= 5e-3 && (summary.estimatedValue ?? 0) > 0) {
            overtimeMoney = Money.from(dayOtShare);
          }
        }
      } catch {
      }
      const hasActivity = hasClockIns || !overtimeMoney.isZero();
      let fixedMoney = Money.zero();
      if (!isPayrollPending) {
        const allocation = await this.allocationService.getDailyPayrollCost(
          profile.id,
          day
        );
        fixedMoney = allocation.dailyFixedCost;
      }
      const isEventual = !hasActiveContract && isPayrollPending;
      if (isEventual) {
        fixedMoney = Money.zero();
      }
      const totalMoney = fixedMoney.add(overtimeMoney);
      const workerPct = Percentage.fromValues(totalMoney, netSalesMoney);
      const shouldInclude = includeAll ? hasActiveContract || hasActivity : hasActivity;
      if (shouldInclude) {
        workerDTOs.push({
          id: profile.id,
          name,
          fixed: fixedMoney.amount,
          overtime: overtimeMoney.amount,
          total: totalMoney.amount,
          laborPctOfSales: netSalesMoney.isZero() ? null : workerPct.value,
          hasActivity,
          hasActiveContract,
          isEventual
        });
        summaryFixed = summaryFixed.add(fixedMoney);
        summaryOvertime = summaryOvertime.add(overtimeMoney);
      }
    }
    const summaryTotalCost = summaryFixed.add(summaryOvertime);
    const summaryPct = Percentage.fromValues(summaryTotalCost, netSalesMoney);
    let pctStatus = "complete";
    if (netSalesMoney.isZero()) {
      pctStatus = "no_sales";
    } else if (isPayrollPending) {
      pctStatus = "incomplete_payroll_pending";
    }
    return {
      dateYmd: day,
      netSales: netSalesMoney.amount,
      totalFixed: summaryFixed.amount,
      totalOvertime: summaryOvertime.amount,
      totalCost: summaryTotalCost.amount,
      laborPctOfSales: netSalesMoney.isZero() ? null : summaryPct.value,
      isPayrollPending,
      pctStatus,
      workers: workerDTOs,
      reconciliation: null
    };
  }
};

// src/lib/payroll/payroll-allocation-service.ts
var PayrollAllocationService = class {
  constructor(payrollRepo, contractTermsService) {
    this.payrollRepo = payrollRepo;
    this.contractTermsService = contractTermsService;
  }
  /**
   * Calcula el coste fijo diario para un trabajador en una fecha determinada.
   */
  async getDailyPayrollCost(userId, dateYmd) {
    const batchResults = await this.getDailyPayrollCostBatch([userId], dateYmd);
    return batchResults[userId] ?? {
      userId,
      dateYmd,
      periodYm: dateYmd.substring(0, 7),
      dailyFixedCost: Money.zero(),
      monthlyCompanyCost: Money.zero(),
      activeContractDays: 0,
      isContractActiveOnDate: false,
      traceability: {
        periodYm: dateYmd.substring(0, 7),
        settlementsCount: 0,
        formula: "0 / 0 = 0.00 \u20AC (Sin datos)"
      }
    };
  }
  /**
   * Calcula en lote el coste fijo diario para múltiples trabajadores en una fecha.
   */
  async getDailyPayrollCostBatch(userIds, dateYmd) {
    if (userIds.length === 0) return {};
    const day = dateYmd.split("T")[0];
    const periodYm = day.substring(0, 7);
    const activeDaysBatch = await this.contractTermsService.getActiveContractDaysBatch(
      userIds,
      periodYm
    );
    const result = {};
    for (const userId of userIds) {
      const monthlyCost = await this.payrollRepo.getMonthlyCompanyCostConsolidated(
        userId,
        periodYm
      );
      const activeFacts = await this.payrollRepo.getActiveFactsForUser(userId, periodYm);
      const activeContractDays = activeDaysBatch[userId] ?? 0;
      const isContractActive = await this.contractTermsService.isContractActiveOn(
        userId,
        day
      );
      let dailyFixedCost = Money.zero();
      let formula = `${monthlyCost.amount} \u20AC / ${activeContractDays} d\xEDas (Sin contrato activo en fecha)`;
      if (isContractActive && activeContractDays > 0 && !monthlyCost.isZero()) {
        dailyFixedCost = monthlyCost.divide(activeContractDays);
        formula = `${monthlyCost.amount} \u20AC / ${activeContractDays} d\xEDas vigentes = ${dailyFixedCost.amount} \u20AC/d\xEDa`;
      } else if (activeContractDays === 0) {
        formula = `0 \u20AC (Eventual / Sin tramos en hours_contract_terms)`;
      }
      result[userId] = {
        userId,
        dateYmd: day,
        periodYm,
        dailyFixedCost,
        monthlyCompanyCost: monthlyCost,
        activeContractDays,
        isContractActiveOnDate: isContractActive,
        traceability: {
          periodYm,
          settlementsCount: activeFacts.length,
          formula
        }
      };
    }
    return result;
  }
};

// src/lib/payroll/contract-terms-service.ts
var ContractTermsStore = class {
  constructor(terms) {
    this.terms = terms;
  }
  isContractActiveOn(userId, dateYmd) {
    const day = dateYmd.split("T")[0];
    const userTerms = this.terms.filter((t) => t.user_id === userId);
    return userTerms.some((t) => {
      const from = t.effective_from.split("T")[0];
      const to = t.effective_to ? t.effective_to.split("T")[0] : "9999-12-31";
      return day >= from && day <= to;
    });
  }
  getActiveContractDays(userId, periodYm) {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const userTerms = this.terms.filter((t) => t.user_id === userId);
    if (userTerms.length === 0) return 0;
    let activeDaysCount = 0;
    for (const dayYmd of monthDays) {
      const isCovered = userTerms.some((t) => {
        const from = t.effective_from.split("T")[0];
        const to = t.effective_to ? t.effective_to.split("T")[0] : "9999-12-31";
        return dayYmd >= from && dayYmd <= to;
      });
      if (isCovered) {
        activeDaysCount++;
      }
    }
    return activeDaysCount;
  }
};
var ContractTermsService = class _ContractTermsService {
  constructor(supabase) {
    this.supabase = supabase;
  }
  /**
   * Obtiene la lista de fechas YYYY-MM-DD del mes (ej: '2026-07-01' a '2026-07-31').
   */
  static listMonthDays(periodYm) {
    const [y, m] = periodYm.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) return [];
    const daysInMonth = new Date(y, m, 0).getDate();
    const out = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      out.push(`${y}-${mm}-${dd}`);
    }
    return out;
  }
  /**
   * Carga en LOTE (1 sola consulta SQL) todos los tramos de contrato de los usuarios para el mes.
   */
  async loadTermsForMonth(userIds, periodYm) {
    if (userIds.length === 0) return new ContractTermsStore([]);
    const monthDays = _ContractTermsService.listMonthDays(periodYm);
    if (monthDays.length === 0) return new ContractTermsStore([]);
    const monthEnd = monthDays[monthDays.length - 1];
    const { data: terms, error } = await this.supabase.from("hours_contract_terms").select("user_id, effective_from, effective_to").in("user_id", userIds).lte("effective_from", monthEnd);
    if (error) {
      throw new Error(`Error en ContractTermsService.loadTermsForMonth: ${error.message}`);
    }
    return new ContractTermsStore(terms ?? []);
  }
  /**
   * Calcula D_vigentes: número de días naturales del mes en los que el contrato estuvo realmente vigente.
   */
  async getActiveContractDays(userId, periodYm) {
    const store = await this.loadTermsForMonth([userId], periodYm);
    return store.getActiveContractDays(userId, periodYm);
  }
  /**
   * Obtiene en lote el número de días de contrato vigentes (D_vigentes) para múltiples usuarios en un mes.
   */
  async getActiveContractDaysBatch(userIds, periodYm) {
    const store = await this.loadTermsForMonth(userIds, periodYm);
    const result = {};
    for (const id of userIds) {
      result[id] = store.getActiveContractDays(id, periodYm);
    }
    return result;
  }
  /**
   * Verifica en memoria si un usuario tenía contrato vigente en una fecha concreta.
   */
  async isContractActiveOn(userId, dateYmd) {
    const periodYm = dateYmd.substring(0, 7);
    const store = await this.loadTermsForMonth([userId], periodYm);
    return store.isContractActiveOn(userId, dateYmd);
  }
  /**
   * Obtiene la cobertura contractual detallada de un usuario para un mes.
   */
  async getContractCoverage(userId, periodYm) {
    const monthDays = _ContractTermsService.listMonthDays(periodYm);
    const activeDays = await this.getActiveContractDays(userId, periodYm);
    return {
      hasCoverage: activeDays > 0,
      activeDays,
      totalMonthDays: monthDays.length
    };
  }
};

// src/lib/payroll/payroll-fact-repository.ts
var PayrollFactRepository = class {
  constructor(supabase) {
    this.supabase = supabase;
  }
  /**
   * Obtiene todos los hechos contables activos ('active') para un periodo YYYY-MM.
   */
  async getActiveFactsForPeriod(periodYm) {
    const { data, error } = await this.supabase.from("employee_payroll_facts").select("*").eq("period_ym", periodYm).eq("status", "active");
    if (error) {
      throw new Error(`Error en PayrollFactRepository.getActiveFactsForPeriod: ${error.message}`);
    }
    return data ?? [];
  }
  /**
   * Obtiene todos los hechos contables activos ('active') de un usuario en un periodo YYYY-MM.
   */
  async getActiveFactsForUser(userId, periodYm) {
    const { data, error } = await this.supabase.from("employee_payroll_facts").select("*").eq("user_id", userId).eq("period_ym", periodYm).eq("status", "active");
    if (error) {
      throw new Error(`Error en PayrollFactRepository.getActiveFactsForUser: ${error.message}`);
    }
    return data ?? [];
  }
  /**
   * Obtiene el coste empresa mensual consolidado.
   */
  async getMonthlyCompanyCostConsolidated(userId, periodYm) {
    const facts = await this.getActiveFactsForUser(userId, periodYm);
    if (facts.length === 0) {
      return Money.zero();
    }
    const total = facts.reduce((sum, f) => sum + Number(f.total_company_cost), 0);
    return Money.from(total);
  }
  /**
   * Obtiene todo el historial de hechos contables.
   */
  async getFactHistory(userId, periodYm) {
    const { data, error } = await this.supabase.from("employee_payroll_facts").select("*").eq("user_id", userId).eq("period_ym", periodYm).order("version", { ascending: true });
    if (error) {
      throw new Error(`Error en PayrollFactRepository.getFactHistory: ${error.message}`);
    }
    return data ?? [];
  }
};

// src/lib/use-cases/get-daily-labor-cost.ts
var GetDailyLaborCostUseCase = class {
  constructor(supabase) {
    this.supabase = supabase;
    const payrollRepo = new PayrollFactRepository(supabase);
    const contractTermsService = new ContractTermsService(supabase);
    const allocationService = new PayrollAllocationService(payrollRepo, contractTermsService);
    this.dayProjector = new LaborCostDayReadModelProjector(
      supabase,
      allocationService,
      contractTermsService,
      payrollRepo
    );
  }
  /**
   * Ejecuta el Caso de Uso para obtener el coste laboral diario SSOT V2.
   */
  async execute(dateYmd, options) {
    return this.dayProjector.projectDayDetail(dateYmd, options);
  }
};

// src/scripts/final-validation.ts
import { config } from "dotenv";
config({ path: ".env.local" });
async function runValidation() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let allPassed = true;
  console.log("=== VALIDACI\xD3N FUNCIONAL FINAL ===");
  console.log("-> Corriendo M\xFAltiples liquidaciones...");
  try {
    const useCase = new GetDailyLaborCostUseCase(supabase);
    const res = await useCase.execute("2026-07-15");
    const alba = res.workers.find((w) => w.name.includes("Alba"));
    const mamadou = res.workers.find((w) => w.name.includes("Mamadou") || w.name.includes("MAMADOU"));
    if (alba && Math.abs(alba.total - 131) < 0.1 && mamadou && Math.abs(mamadou.total - 109.35) < 0.1) {
      console.log("M\xFAltiples liquidaciones -> \u2705 PASS");
      console.log("Dashboard -> \u2705 PASS");
    } else {
      console.log("M\xFAltiples liquidaciones -> \u274C FAIL");
      console.log("Dashboard -> \u274C FAIL");
      allPassed = false;
    }
  } catch (e) {
    console.log("Error en M\xFAltiples liquidaciones:", e);
    allPassed = false;
  }
  console.log("-> Corriendo Concurrencia...");
  try {
    const concPeriod = "2026-12";
    await supabase.from("employee_payroll_facts").delete().eq("period_ym", concPeriod);
    const idemFacts = [{ user_id: "048018f9-76cc-4fe2-a966-de769977cc07", total_company_cost: 1e3, gross_salary: 1e3, ss_employee: 0, ss_company: 0, tc1_cost: 0, net_salary: 1e3, settlement_hash: "idem1" }];
    const p1 = supabase.rpc("replace_payroll_month_atomic", { p_period_ym: concPeriod, p_facts: idemFacts });
    const p2 = supabase.rpc("replace_payroll_month_atomic", { p_period_ym: concPeriod, p_facts: idemFacts });
    await Promise.all([p1, p2]);
    const { data: concData } = await supabase.from("employee_payroll_facts").select("*").eq("period_ym", concPeriod).eq("status", "active");
    if (concData?.length === 1) {
      console.log("Concurrencia -> \u2705 PASS");
    } else {
      console.log("Concurrencia -> \u274C FAIL", concData?.length);
      allPassed = false;
    }
  } catch (e) {
    console.log("Error en Concurrencia:", e);
    allPassed = false;
  }
  process.exit(allPassed ? 0 : 1);
}
runValidation().catch((e) => {
  console.error("Fatal Error:", e);
  process.exit(1);
});
