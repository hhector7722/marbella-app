'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
    getCachedLaborRate,
    setCachedLaborRate,
} from '@/lib/labor-rate-session-cache';
import {
    computeLaborCostPctOfSales,
    computeRequiredBilling,
    computeScheduleDayLaborCost,
    formatScheduleEuro,
    scheduleLaborRatioColorClass,
    type ScheduleShiftForCost,
} from '@/lib/schedule-day-profitability';

type Props = {
    date: string;
    shifts: ScheduleShiftForCost[];
};

export function ScheduleDayProfitabilityBar({ date, shifts }: Props) {
    const supabase = createClient();
    const [isHector, setIsHector] = useState<boolean | null>(null);
    const [rateByUserId, setRateByUserId] = useState<Record<string, number>>({});
    const [daySalesTotal, setDaySalesTotal] = useState<number | null>(null);
    const [salesLoading, setSalesLoading] = useState(false);

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
                        const { data, error } = await supabase.rpc('fn_labor_effective_ordinary_rate', {
                            p_user_id: userId,
                            p_on_date: date,
                        });
                        const rate = error ? 0 : Number(data) || 0;
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
    }, [isHector, date, activeEmployeeIds.join('|'), supabase]);

    useEffect(() => {
        if (!isHector || !date) return;
        let cancelled = false;
        setSalesLoading(true);

        (async () => {
            const { data, error } = await supabase
                .from('tickets_marbella')
                .select('total_documento')
                .eq('fecha', date);

            if (cancelled) return;
            if (error) {
                console.error('[ScheduleDayProfitabilityBar] tickets_marbella', error);
                setDaySalesTotal(null);
            } else {
                const sum = (data ?? []).reduce(
                    (acc, row) => acc + (Number(row.total_documento) || 0),
                    0,
                );
                setDaySalesTotal(sum);
            }
            setSalesLoading(false);
        })();

        return () => { cancelled = true; };
    }, [isHector, date, supabase]);

    const laborCost = useMemo(
        () => computeScheduleDayLaborCost(shifts, rateByUserId),
        [shifts, rateByUserId],
    );

    const requiredBilling = useMemo(
        () => computeRequiredBilling(laborCost),
        [laborCost],
    );

    const ratioPct = useMemo(
        () => (daySalesTotal != null ? computeLaborCostPctOfSales(laborCost, daySalesTotal) : null),
        [laborCost, daySalesTotal],
    );

    if (isHector !== true) return null;

    const ratioLabel =
        ratioPct === null
            ? '—'
            : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(ratioPct)}%`;

    const ratioClass =
        ratioPct === null ? 'text-zinc-400' : scheduleLaborRatioColorClass(ratioPct);

    return (
        <div
            className="mx-3 mb-2 mt-1 shrink-0 rounded-xl border border-zinc-100 bg-zinc-50/90 px-3 py-2"
            aria-label="Indicador de rentabilidad del día"
        >
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                    Rentabilidad día
                </p>
                <div className="flex flex-col gap-0.5 text-[10px] font-bold text-zinc-600 sm:flex-row sm:flex-wrap sm:gap-x-4">
                    <span>
                        Coste personal:{' '}
                        <span className="font-black text-zinc-800">{formatScheduleEuro(laborCost)}</span>
                    </span>
                    <span>
                        Facturación necesaria:{' '}
                        <span className="font-black text-zinc-800">
                            {formatScheduleEuro(requiredBilling)} (35%)
                        </span>
                    </span>
                    <span>
                        Ratio actual:{' '}
                        <span className={cn('font-black', ratioClass, salesLoading && 'opacity-60')}>
                            {ratioLabel}
                        </span>
                    </span>
                </div>
            </div>
        </div>
    );
}
