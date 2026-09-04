'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
    getCachedLaborRate,
    setCachedLaborRate,
} from '@/lib/labor-rate-session-cache';
import {
    computeRequiredBilling,
    computeScheduleDayLaborCost,
    formatScheduleEuro,
    type ScheduleShiftForCost,
} from '@/lib/schedule-day-profitability';
import { getSsotOrdinaryHourlyRate } from '@/app/actions/ssot-ordinary-rate';

type Props = {
    date: string;
    shifts: ScheduleShiftForCost[];
};

export function ScheduleDayProfitabilityBar({ date, shifts }: Props) {
    const supabase = createClient();
    const [isHector, setIsHector] = useState<boolean | null>(null);
    const [rateByUserId, setRateByUserId] = useState<Record<string, number>>({});

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled) return;
            setIsHector(isMasterDashboardUser(user?.email));
        })();
        return () => { cancelled = true; };
    }, [supabase]);

    const activeEmployeeIds = useMemo(() => {
        const ids = new Set<string>();
        for (const s of shifts) {
            if (s.active === false || !s.start || !s.end) continue;
            ids.add(s.employeeId);
        }
        return [...ids];
    }, [shifts]);

    useEffect(() => {
        if (!isHector || !date) return;
        let cancelled = false;

        (async () => {
            const next: Record<string, number> = {};
            const toFetch: string[] = [];

            for (const id of activeEmployeeIds) {
                const cached = getCachedLaborRate(id, date);
                if (cached !== undefined) {
                    next[id] = cached;
                } else {
                    toFetch.push(id);
                }
            }

            if (toFetch.length > 0) {
                const fetched = await Promise.all(
                    toFetch.map(async (userId) => {
                        const res = await getSsotOrdinaryHourlyRate(userId, date);
                        const rate = res.success ? res.rate : 0;
                        setCachedLaborRate(userId, date, rate);
                        return { userId, rate };
                    }),
                );
                if (cancelled) return;
                for (const { userId, rate } of fetched) {
                    next[userId] = rate;
                }
            }

            if (!cancelled) setRateByUserId(next);
        })();

        return () => { cancelled = true; };
    }, [isHector, date, activeEmployeeIds, supabase]);

    const laborCost = useMemo(
        () => computeScheduleDayLaborCost(shifts, rateByUserId),
        [shifts, rateByUserId],
    );

    const requiredBilling = useMemo(
        () => computeRequiredBilling(laborCost),
        [laborCost],
    );

    if (isHector !== true) return null;

    return (
        <div
            className="mx-auto mb-2 mt-1 flex w-fit max-w-[calc(100%-1.5rem)] shrink-0 overflow-x-auto rounded-xl bg-white/10 px-3 py-2"
            aria-label="Indicador de rentabilidad del día"
        >
            <div className="flex min-w-0 items-center gap-x-4 whitespace-nowrap text-[10px] font-semibold text-white">
                    <span>
                        Coste{' '}
                        <span className="font-semibold text-white">{formatScheduleEuro(laborCost)}</span>
                    </span>
                    <span>
                        Facturación rentable{' '}
                        <span className="font-semibold text-white">
                            {formatScheduleEuro(requiredBilling)}
                        </span>
                    </span>
            </div>
        </div>
    );
}
