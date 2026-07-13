import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { normalizeStaffSchedule, resolveSimulationProfile } from '../src/lib/staff/staff-schedule-normalizer';
import { buildCoordinatedPlantillaSimulation } from '../src/lib/staff/coordinated-plantilla-simulation';
import { buildTimesheetPayload } from '../src/lib/staff/timesheet-export-payload';
import type { TimesheetWeekData } from '../src/lib/staff/timesheet-export-payload';

function loadEnv() {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i === -1) continue;
        const k = t.slice(0, i).trim();
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        process.env[k] ??= v;
    }
}

loadEnv();

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const year = 2026;
const months = 7;

async function fetchWeeks(userId: string): Promise<TimesheetWeekData[]> {
    const all: TimesheetWeekData[] = [];
    for (let m = 1; m <= months; m++) {
        const { data, error } = await supabase.rpc('get_monthly_timesheet', {
            p_user_id: userId,
            p_year: year,
            p_month: m,
        });
        if (error) {
            console.error('RPC error', m, error.message);
            continue;
        }
        const weeks = (data as TimesheetWeekData[]) ?? [];
        all.push(
            ...weeks.map((week) => ({
                ...week,
                startDate: String(week.startDate).split('T')[0],
                days: week.days.map((day) => ({
                    ...day,
                    eventType: (day as { eventType?: string; event_type?: string }).eventType
                        ?? (day as { event_type?: string }).event_type
                        ?? 'regular',
                })),
            })),
        );
    }
    const by = new Map<string, TimesheetWeekData>();
    for (const w of all) by.set(w.startDate, w);
    return [...by.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function countAdj(weeks: TimesheetWeekData[], label: string) {
    const rows = weeks.flatMap((w) => w.days).filter((d) => d.eventType === 'adjustment' && d.hasLog);
    console.log(`${label}: ${rows.length}`, rows.slice(0, 3).map((d) => ({
        date: d.date,
        clockIn: d.clockIn,
        clockOut: d.clockOut,
        totalHours: d.totalHours,
    })));
    return rows.length;
}

async function main() {
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, contracted_hours_weekly, joining_date, end_date')
        .in('first_name', ['Hernan', 'Juan']);

    if (!profiles?.length) {
        console.log('No profiles');
        return;
    }

    for (const p of profiles) {
        console.log('\n===', p.first_name, p.id, '===');
        const weeks = await fetchWeeks(p.id);
        countAdj(weeks, 'Real');

        const contract = {
            contractedHoursWeekly: Number(p.contracted_hours_weekly ?? 0),
            joiningDate: p.joining_date,
            endDate: p.end_date,
        };
        const res = resolveSimulationProfile(weeks, contract, '2026-07-13');
        console.log('canSimulate', res.canSimulate, 'contract', res.contractedHoursWeekly);

        const sim = normalizeStaffSchedule(
            weeks,
            { userId: p.id, email: p.email },
            contract,
            '2026-07-13',
            res,
        );
        countAdj(sim, 'After normalize');

        const coord = buildCoordinatedPlantillaSimulation(
            [p],
            new Map([[p.id, weeks]]),
            { start: '2026-01-01', end: '2026-07-13' },
            '2026-07-13',
        );
        const entry = coord.entries[0];
        if (entry) countAdj(entry.weeks, 'After coord');

        if (entry) {
            const payload = buildTimesheetPayload(
                entry.weeks,
                `${p.first_name} ${p.last_name}`,
                null,
                year,
                0,
                'test',
                entry.contractedHoursWeekly,
            );
            const bajas = payload.rows.filter((r) => r.eventType === 'adjustment');
            console.log('Payload bajas:', bajas.length, bajas.slice(0, 2));
        }
    }
}

main().catch(console.error);
