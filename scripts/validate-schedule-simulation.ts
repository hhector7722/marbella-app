/**
 * Validación offline de simulación de jornada (ene–jul año actual).
 * Uso: node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/validate-schedule-simulation.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildTimesheetPayload, type TimesheetWeekData } from '../src/lib/staff/timesheet-export-payload.ts';
import { normalizeStaffSchedule, resolveSimulationProfile } from '../src/lib/staff/staff-schedule-normalizer.ts';

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnvLocal() {
    const envPath = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(envPath)) throw new Error('Falta .env.local');
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        process.env[key] ??= val;
    }
}

// ---------------------------------------------------------------------------
// Empleados objetivo
// ---------------------------------------------------------------------------

const TARGETS = [
    { key: 'hector', match: (f: string) => /^hector|héctor$/i.test(f) },
    { key: 'pere', match: (f: string) => /^pere$/i.test(f) },
    { key: 'juan', id: 'd5e119bc-e7af-4414-9428-c1aead5fe80f' },
    { key: 'willy', match: (f: string) => /^willy$/i.test(f) },
    { key: 'silvia', match: (f: string) => /^silvia$/i.test(f) },
] as const;

type ProfileRow = {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    dni: string | null;
    contracted_hours_weekly: number | null;
    joining_date: string | null;
    end_date: string | null;
};

type MonthlyTimesheetRpcWeek = TimesheetWeekData & {
    days: Array<TimesheetWeekData['days'][number] & { event_type?: string }>;
};

// ---------------------------------------------------------------------------
// Fetch + normalizar
// ---------------------------------------------------------------------------

async function fetchWeeksForPeriod(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    year: number,
    lastMonth: number,
): Promise<TimesheetWeekData[]> {
    const allWeeks: TimesheetWeekData[] = [];

    for (let month = 1; month <= lastMonth; month++) {
        const { data, error } = await supabase.rpc('get_monthly_timesheet', {
            p_user_id: userId,
            p_year: year,
            p_month: month,
        });
        if (error) throw new Error(`RPC ${userId} ${year}-${month}: ${error.message}`);
        const weeks = ((data as MonthlyTimesheetRpcWeek[]) ?? []).map((week) => ({
            ...week,
            startDate: String(week.startDate).split('T')[0],
            days: week.days.map((day) => ({
                ...day,
                eventType: day.eventType ?? day.event_type ?? 'regular',
            })),
        }));
        allWeeks.push(...weeks);
    }

    // Deduplicar semanas solapadas (varios meses comparten semana ISO)
    const byStart = new Map<string, TimesheetWeekData>();
    for (const week of allWeeks) {
        byStart.set(week.startDate, week);
    }
    return [...byStart.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------

interface WeekStats {
    startDate: string;
    flexDays: number;
    lockedDays: number;
    totalHours: number;
    flexHours: number;
    lockedHours: number;
    dates: string[];
}

interface AnalysisResult {
    employee: string;
    contractedWeekly: number;
    totalRows: number;
    totalHours: number;
    weeks: WeekStats[];
    anomalies: string[];
    naturalness: string[];
    weeklyDistribution: string[];
    consistency: string[];
    strengths: string[];
    improvements: string[];
}

const LOCKED = new Set(['holiday', 'personal', 'adjustment']);

function parseHm(hm: string): number {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
}

function isWeekend(date: string): boolean {
    const [y, m, d] = date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return dow === 0 || dow === 6;
}

function analyzeEmployee(
    name: string,
    contractedWeekly: number,
    weeks: TimesheetWeekData[],
    payloadRows: ReturnType<typeof buildTimesheetPayload>['rows'],
): AnalysisResult {
    const anomalies: string[] = [];
    const naturalness: string[] = [];
    const weeklyDistribution: string[] = [];
    const consistency: string[] = [];
    const strengths: string[] = [];
    const improvements: string[] = [];

    const weekStats: WeekStats[] = [];
    const allStarts: number[] = [];
    const allDurations: number[] = [];
    const clockInSet = new Set<string>();

    for (const week of weeks) {
        const logged = week.days.filter((d) => d.hasLog);
        const flex = logged.filter((d) => !LOCKED.has(d.eventType));
        const locked = logged.filter((d) => LOCKED.has(d.eventType));
        const flexHours = flex.reduce((a, d) => a + d.totalHours, 0);
        const lockedHours = locked.reduce((a, d) => a + d.totalHours, 0);
        const totalHours = flexHours + lockedHours;

        weekStats.push({
            startDate: week.startDate,
            flexDays: flex.length,
            lockedDays: locked.length,
            totalHours: Math.round(totalHours * 100) / 100,
            flexHours: Math.round(flexHours * 100) / 100,
            lockedHours: Math.round(lockedHours * 100) / 100,
            dates: flex.map((d) => d.date),
        });

        for (const day of flex) {
            if (day.totalHours < 4) anomalies.push(`Jornada <4h: ${day.date} (${day.totalHours}h)`);
            if (day.totalHours > 10) anomalies.push(`Jornada >10h: ${day.date} (${day.totalHours}h)`);
            if (day.clockIn) {
                const start = parseHm(day.clockIn);
                if (start < 7 * 60 + 15) anomalies.push(`Entrada muy temprana: ${day.date} ${day.clockIn}`);
                if (start > 12 * 60) anomalies.push(`Entrada muy tardía: ${day.date} ${day.clockIn}`);
                allStarts.push(start);
                clockInSet.add(day.clockIn);
            }
            if (day.clockOut) {
                const end = parseHm(day.clockOut);
                if (end > 22 * 60 + 15) anomalies.push(`Salida muy tardía: ${day.date} ${day.clockOut}`);
            }
            if (day.clockIn && day.clockOut) {
                allDurations.push(day.totalHours);
            }
            if (day.clockIn && day.clockOut && day.clockIn === day.clockOut) {
                anomalies.push(`Entrada = salida: ${day.date}`);
            }
        }

        if (contractedWeekly > 0) {
            const delta = Math.abs(totalHours - contractedWeekly);
            if (delta > 2) {
                anomalies.push(
                    `Semana ${week.startDate}: ${totalHours}h vs contrato ${contractedWeekly}h (Δ ${Math.round(delta * 10) / 10}h)`,
                );
            }
            if (flex.length === 0 && locked.length === 0) {
                anomalies.push(`Semana vacía: ${week.startDate}`);
            }
            if (flex.length >= 6) {
                anomalies.push(`Semana con muchas jornadas flexibles (${flex.length}): ${week.startDate}`);
            }
        }
    }

    // Semanas vacías entre semanas con actividad
    const activeWeekIdx = weekStats
        .map((w, i) => (w.flexDays + w.lockedDays > 0 ? i : -1))
        .filter((i) => i >= 0);
    for (let i = 1; i < activeWeekIdx.length; i++) {
        const prev = activeWeekIdx[i - 1];
        const curr = activeWeekIdx[i];
        for (let j = prev + 1; j < curr; j++) {
            if (weekStats[j].flexDays + weekStats[j].lockedDays === 0) {
                anomalies.push(`Semana sin actividad entre semanas trabajadas: ${weekStats[j].startDate}`);
            }
        }
    }

    // Días consecutivos >5
    const flexDates = payloadRows
        .filter((r) => r.eventType !== 'adjustment' && r.eventType !== 'holiday' && r.eventType !== 'personal')
        .map((r) => r.date)
        .sort();
    let streak = 1;
    for (let i = 1; i < flexDates.length; i++) {
        const prev = flexDates[i - 1];
        const curr = flexDates[i];
        const [y1, m1, d1] = prev.split('-').map(Number);
        const next = new Date(y1, m1 - 1, d1);
        next.setDate(next.getDate() + 1);
        const expected = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
        if (curr === expected) {
            streak += 1;
            if (streak > 5) anomalies.push(`Racha de ${streak} días consecutivos hasta ${curr}`);
        } else {
            streak = 1;
        }
    }

    // Patrones repetidos
    if (clockInSet.size > 0 && payloadRows.length > 10 && clockInSet.size <= 3) {
        anomalies.push(`Pocas entradas distintas (${clockInSet.size}): posible patrón repetitivo`);
    }

    const identicalDuration = allDurations.length > 5 && new Set(allDurations.map((h) => h.toFixed(2))).size <= 2;
    if (identicalDuration) {
        anomalies.push('Muchas jornadas con duración casi idéntica');
    }

    // Informe cualitativo
    if (anomalies.length === 0) strengths.push('Sin anomalías automáticas detectadas.');
    if (allStarts.length > 0) {
        const minStart = Math.min(...allStarts);
        const maxStart = Math.max(...allStarts);
        const spread = maxStart - minStart;
        if (spread >= 20 && spread <= 120) {
            strengths.push(`Entradas dispersas de forma razonable (${spread} min de rango).`);
        } else if (spread < 15) {
            improvements.push('Aumentar ligeramente la variación de hora de entrada.');
        }
    }

    const onTargetWeeks = weekStats.filter(
        (w) => contractedWeekly <= 0 || Math.abs(w.totalHours - contractedWeekly) <= 1.5,
    ).length;
    weeklyDistribution.push(
        `${onTargetWeeks}/${weekStats.length} semanas dentro de ±1.5h del contrato (${contractedWeekly}h/sem).`,
    );

    const avgFlexDays =
        weekStats.filter((w) => w.flexDays > 0).reduce((a, w) => a + w.flexDays, 0) /
        Math.max(1, weekStats.filter((w) => w.flexDays > 0).length);
    weeklyDistribution.push(`Media de jornadas flexibles por semana activa: ${avgFlexDays.toFixed(1)}.`);

    if (contractedWeekly === 28 && avgFlexDays >= 4 && avgFlexDays <= 5) {
        strengths.push('Distribución coherente para contrato de 28h (~4 jornadas).');
    }
    if (contractedWeekly === 40 && avgFlexDays >= 4 && avgFlexDays <= 5) {
        strengths.push('Distribución coherente para contrato de 40h (~5 jornadas).');
    }
    if (contractedWeekly === 8 && avgFlexDays >= 1 && avgFlexDays <= 2) {
        strengths.push('Distribución coherente para contrato de 8h (~1 jornada).');
    }
    if (contractedWeekly === 16 && avgFlexDays >= 2 && avgFlexDays <= 3) {
        strengths.push('Distribución coherente para contrato de 16h (~2 jornadas).');
    }

    naturalness.push(`${payloadRows.length} días exportados en el período simulado.`);
    if (!identicalDuration) naturalness.push('Hay variación en la duración de las jornadas.');
    if (clockInSet.size >= 4) naturalness.push('Hay variación en las horas de entrada.');

    consistency.push(
        allStarts.length > 0
            ? `Entrada habitual simulada entre ${minutesToHm(Math.min(...allStarts))} y ${minutesToHm(Math.max(...allStarts))}.`
            : 'Sin entradas registradas en jornadas flexibles.',
    );

    if (anomalies.some((a) => a.includes('Δ'))) {
        improvements.push('Afinar el balance semanal para acercar más semanas al contrato exacto.');
    }
    if (anomalies.some((a) => a.includes('repetit'))) {
        improvements.push('Introducir más variación determinista en entradas/salidas.');
    }
    if (anomalies.some((a) => a.includes('Semana vacía'))) {
        improvements.push('Evitar huecos semanales en períodos con actividad adyacente.');
    }

    return {
        employee: name,
        contractedWeekly,
        totalRows: payloadRows.length,
        totalHours: Math.round(payloadRows.reduce((a, r) => a + r.workedMinutes / 60, 0) * 100) / 100,
        weeks: weekStats,
        anomalies,
        naturalness,
        weeklyDistribution,
        consistency,
        strengths: strengths.length ? strengths : ['Histórico generado sin destacar fortalezas específicas.'],
        improvements: improvements.length ? improvements : ['Sin mejoras urgentes detectadas por el analizador.'],
    };
}

function minutesToHm(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// PDF (Node): polyfill mínimo + guardar en disco
// ---------------------------------------------------------------------------

async function savePdfToFile(payload: ReturnType<typeof buildTimesheetPayload>, outPath: string) {
    // Import dinámico para no cargar jsPDF hasta hace falta
    const { generateTimesheetPdfNode } = await import('../src/lib/staff/timesheet-pdf-node.ts');
    await generateTimesheetPdfNode(payload, outPath);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    loadEnvLocal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Faltan variables Supabase en .env.local');

    const supabase = createClient(url, key);
    const year = new Date().getFullYear();
    const lastMonth = new Date().getMonth() + 1; // mes actual 1-indexed

    const outDir = path.join(process.cwd(), 'tmp', 'simulation-validation');
    fs.mkdirSync(outDir, { recursive: true });

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, dni, contracted_hours_weekly, joining_date, end_date');

    if (error) throw error;

    const results: AnalysisResult[] = [];

    for (const target of TARGETS) {
        const profile = (profiles as ProfileRow[]).find((p) =>
            'id' in target && target.id
                ? p.id === target.id
                : 'match' in target && target.match(p.first_name.trim()),
        );
        if (!profile) {
            console.warn(`No encontrado: ${target.key}`);
            continue;
        }

        const fullName = `${profile.first_name} ${profile.last_name}`.trim();
        const realWeeks = await fetchWeeksForPeriod(supabase, profile.id, year, lastMonth);
        const contract = {
            contractedHoursWeekly: Number(profile.contracted_hours_weekly ?? 0),
            endDate: profile.end_date,
        };
        const resolution = resolveSimulationProfile(realWeeks, contract);
        if (!resolution.canSimulate) {
            console.warn(`✗ ${fullName}: ${resolution.reason}`);
            continue;
        }

        const simulatedWeeks = normalizeStaffSchedule(
            realWeeks,
            { userId: profile.id, email: profile.email },
            contract,
            undefined,
            resolution,
        );

        const periodLabel = `Ene – ${new Date(year, lastMonth - 1, 1).toLocaleDateString('es-ES', { month: 'short' })} ${year}`;
        const payload = buildTimesheetPayload(
            simulatedWeeks,
            fullName,
            profile.dni,
            year,
            0,
            periodLabel,
            resolution.contractedHoursWeekly,
        );

        const pdfName = `simulacion_${target.key}_${year}_ene-jul.pdf`;
        const pdfPath = path.join(outDir, pdfName);
        await savePdfToFile(payload, pdfPath);

        const analysis = analyzeEmployee(
            fullName,
            Number(profile.contracted_hours_weekly ?? 0),
            simulatedWeeks,
            payload.rows,
        );
        results.push(analysis);

        console.log(`✓ ${fullName} → ${pdfPath} (${payload.rows.length} días)`);
    }

    const reportPath = path.join(outDir, 'informe-validacion.json');
    fs.writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), year, lastMonth, results }, null, 2));
    console.log(`\nInforme JSON: ${reportPath}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
