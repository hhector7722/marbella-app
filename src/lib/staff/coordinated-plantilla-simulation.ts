/**
 * Simulación coordinada de toda la plantilla visible (memoria, sin BD).
 * Usado por exportación master y scripts de validación offline.
 */

import {
    normalizeStaffSchedule,
    resolveSimulationProfile,
    type NormalizerContract,
} from './staff-schedule-normalizer';
import {
    coordinatePlantillaSchedules,
    type PlantillaScheduleEntry,
} from './plantilla-schedule-coordinator';
import type { TimesheetWeekData } from './timesheet-export-payload';

export type PlantillaProfileForSimulation = {
    id: string;
    first_name: string;
    last_name: string;
    email?: string | null;
    contracted_hours_weekly?: number | null;
    joining_date?: string | null;
    end_date?: string | null;
};

export type CoordinatedPlantillaResult = {
    entries: PlantillaScheduleEntry[];
    byUserId: Map<string, TimesheetWeekData[]>;
    coordination: ReturnType<typeof coordinatePlantillaSchedules>;
};

export function buildCoordinatedPlantillaSimulation(
    profiles: PlantillaProfileForSimulation[],
    weeksByUserId: Map<string, TimesheetWeekData[]>,
    bounds: { start: string; end: string },
    todayYmd?: string,
): CoordinatedPlantillaResult {
    const today = todayYmd ?? bounds.end;
    const entries: PlantillaScheduleEntry[] = [];

    for (const profile of profiles) {
        const realWeeks = weeksByUserId.get(profile.id);
        if (!realWeeks?.length) continue;

        const contract: NormalizerContract = {
            contractedHoursWeekly: Number(profile.contracted_hours_weekly ?? 0),
            joiningDate: profile.joining_date,
            endDate: profile.end_date,
        };
        const resolution = resolveSimulationProfile(realWeeks, contract, today);
        if (!resolution.canSimulate) continue;

        const simulatedWeeks = normalizeStaffSchedule(
            realWeeks,
            { userId: profile.id, email: profile.email },
            contract,
            today,
            resolution,
        );

        entries.push({
            userId: profile.id,
            email: profile.email,
            fullName: `${profile.first_name} ${profile.last_name}`.trim(),
            weeks: simulatedWeeks,
            contractedHoursWeekly: resolution.contractedHoursWeekly,
            joiningDate: profile.joining_date,
            endDate: profile.end_date,
        });
    }

    const coordination = coordinatePlantillaSchedules(entries, bounds);
    const byUserId = new Map(entries.map((e) => [e.userId, e.weeks]));

    return { entries, byUserId, coordination };
}
