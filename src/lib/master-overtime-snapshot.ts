import type { WeeklyStats } from '@/lib/hours-engine/overtime-weeks-ssot';

export type OvertimeWeekSnapshot = {
    total: number;
    isFullyPaid: boolean;
};

export function pickLatestOvertimeWeekSnapshot(weeks: WeeklyStats[]): OvertimeWeekSnapshot | null {
    const sorted = [...weeks].sort((a, b) => b.weekId.localeCompare(a.weekId));
    const latest = sorted.find((w) => (w.totalAmount ?? 0) > 0.05);
    if (!latest) return null;

    const isFullyPaid =
        latest.staff?.every((s) => {
            const cost = s.totalCost ?? 0;
            return cost < 0.05 || !!s.isPaid || s.preferStock === true;
        }) ?? true;

    return { total: latest.totalAmount, isFullyPaid };
}
