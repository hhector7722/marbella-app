/**
 * Exporta PDFs de simulación coordinada de toda la plantilla visible a Downloads.
 * Uso: npx tsx scripts/export-plantilla-simulation-pdfs.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildCoordinatedPlantillaSimulation } from '../src/lib/staff/coordinated-plantilla-simulation.ts';
import { filterVisiblePlantillaEmployees } from '../src/lib/staff/plantilla-employees.ts';
import { buildTimesheetPayload, type TimesheetWeekData } from '../src/lib/staff/timesheet-export-payload.ts';
import { generateTimesheetPdfNode } from '../src/lib/staff/timesheet-pdf-node.ts';

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

function employeeSlug(fullName: string): string {
    return fullName
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');
}

function buildSimulationPeriodLabel(
    joiningDate: string | null | undefined,
    year: number,
    lastMonth0: number,
): string {
    const endLabel = new Date(year, lastMonth0, 1).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
    const joinYmd = joiningDate?.slice(0, 10);
    const yearStart = `${year}-01-01`;
    if (joinYmd && joinYmd > yearStart) {
        const [y, m, d] = joinYmd.split('-').map(Number);
        const startLabel = new Date(y, m - 1, d).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
        return `${startLabel} – ${endLabel}`;
    }
    return `Ene – ${endLabel}`;
}

type ProfileRow = {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    dni: string | null;
    contracted_hours_weekly: number | null;
    joining_date: string | null;
    end_date: string | null;
    visible_in_plantilla?: boolean | null;
};

type MonthlyTimesheetRpcWeek = TimesheetWeekData & {
    days: Array<TimesheetWeekData['days'][number] & { event_type?: string }>;
};

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

    const byStart = new Map<string, TimesheetWeekData>();
    for (const week of allWeeks) {
        byStart.set(week.startDate, week);
    }
    return [...byStart.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function weekTotals(weeks: TimesheetWeekData[], contract: number): Array<{ start: string; hours: number; delta: number }> {
    return weeks.map((week) => {
        const hours = Math.round(
            week.days.filter((d) => d.hasLog).reduce((s, d) => s + (d.totalHours ?? 0), 0) * 100,
        ) / 100;
        return { start: week.startDate, hours, delta: Math.round((hours - contract) * 10) / 10 };
    });
}

async function main() {
    loadEnvLocal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Faltan variables Supabase en .env.local');

    const supabase = createClient(url, key);
    const year = new Date().getFullYear();
    const lastMonth = new Date().getMonth() + 1;
    const todayYmd = new Date().toISOString().slice(0, 10);
    const plantillaBounds = { start: `${year}-01-01`, end: todayYmd };

    const downloads = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'Downloads');

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, dni, contracted_hours_weekly, joining_date, end_date, visible_in_plantilla');

    if (error) throw error;

    const plantillaProfiles = filterVisiblePlantillaEmployees((profiles ?? []) as ProfileRow[]);
    const weeksByUserId = new Map<string, TimesheetWeekData[]>();

    for (const profile of plantillaProfiles) {
        const weeks = await fetchWeeksForPeriod(supabase, profile.id, year, lastMonth);
        if (weeks.length > 0) {
            weeksByUserId.set(profile.id, weeks);
        }
    }

    const coordinated = buildCoordinatedPlantillaSimulation(plantillaProfiles, weeksByUserId, plantillaBounds, todayYmd);

    console.log(
        `Coordinación: ${coordinated.coordination.staffingBoosts} refuerzos, ` +
            `${coordinated.coordination.shiftsAligned} turnos alineados, ` +
            `${coordinated.coordination.morningExclusiveAdjustments} ajustes mañana exclusiva, ` +
            `${coordinated.coordination.understaffedDates.length} días <3 personas`,
    );

    const balanceReport: Array<{
        name: string;
        contract: number;
        offWeeks: Array<{ start: string; hours: number; delta: number }>;
    }> = [];

    let generated = 0;
    const monthLabel = `${year}-01`;

    for (const entry of coordinated.entries) {
        const profile = plantillaProfiles.find((p) => p.id === entry.userId);
        if (!profile) continue;

        const periodLabel = buildSimulationPeriodLabel(profile.joining_date, year, lastMonth - 1);
        const payload = buildTimesheetPayload(
            entry.weeks,
            entry.fullName,
            profile.dni,
            year,
            0,
            periodLabel,
            entry.contractedHoursWeekly,
        );

        if (payload.rows.length === 0) continue;

        const fileName = `jornada_${employeeSlug(entry.fullName)}_${monthLabel}.pdf`;
        const outPath = path.join(downloads, fileName);
        await generateTimesheetPdfNode(payload, outPath);
        generated += 1;
        console.log(`✓ ${entry.fullName} → ${outPath}`);

        const off = weekTotals(entry.weeks, entry.contractedHoursWeekly).filter(
            (w) => w.hours > 0 && Math.abs(w.delta) > 2,
        );
        if (off.length > 0) {
            balanceReport.push({
                name: entry.fullName,
                contract: entry.contractedHoursWeekly,
                offWeeks: off,
            });
        }
    }

    const reportPath = path.join(downloads, 'plantilla_simulacion_balance.json');
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                generated,
                coordination: coordinated.coordination,
                balanceReport,
            },
            null,
            2,
        ),
    );

    console.log(`\n${generated} PDFs en ${downloads}`);
    console.log(`Informe balance: ${reportPath}`);
    if (balanceReport.length > 0) {
        console.log('\nSemanas fuera de ±2h del contrato:');
        for (const row of balanceReport) {
            console.log(`  ${row.name} (${row.contract}h/sem):`);
            for (const w of row.offWeeks.slice(0, 8)) {
                console.log(`    ${w.start}: ${w.hours}h (Δ ${w.delta > 0 ? '+' : ''}${w.delta}h)`);
            }
            if (row.offWeeks.length > 8) {
                console.log(`    … y ${row.offWeeks.length - 8} semanas más`);
            }
        }
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
