'use client';

import { createContext, use, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { PeriodFilterButton, PeriodNav } from '@/components/time/PeriodNav';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';

function parseDay(day: string | null | undefined): Date {
    if (!day) return new Date();
    const d = parseISO(day);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

function withDay(search: string, next: string): string {
    const params = new URLSearchParams(search);
    params.set('dia', next);
    return params.toString();
}

type DayPeriodChromeContextValue = {
    openFilter: () => void;
};

const DayPeriodChromeContext = createContext<DayPeriodChromeContextValue | null>(null);

/**
 * Une etiqueta del periodo e icono de filtro: ambos abren el mismo TimeFilterModal (P7).
 */
export function DayPeriodChromeProvider({
    day,
    basePath,
    instance,
    children,
}: {
    day: string | null | undefined;
    basePath: string;
    instance: string;
    children: ReactNode;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [open, setOpen] = useState(false);
    const current = parseDay(day);

    const apply = (v: TimeFilterValue) => {
        if (v.kind !== 'date') return;
        const qs = withDay(searchParams.toString(), v.date);
        router.push(`${basePath}?${qs}`);
    };

    return (
        <DayPeriodChromeContext.Provider value={{ openFilter: () => setOpen(true) }}>
            {children}
            <TimeFilterModal
                isOpen={open}
                onClose={() => setOpen(false)}
                onApply={apply}
                allowedKinds={['date']}
                initialValue={{ kind: 'date', date: format(current, 'yyyy-MM-dd') }}
                defaultKind="date"
            />
        </DayPeriodChromeContext.Provider>
    );
}

export function DayPeriodNav({
    day,
    basePath,
}: {
    day: string | null | undefined;
    basePath: string;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const chrome = use(DayPeriodChromeContext);
    const current = parseDay(day);
    const label = day ? format(current, 'd MMM yyyy', { locale: es }) : 'Hoy';

    const pushDay = (next: Date) => {
        const qs = withDay(searchParams.toString(), format(next, 'yyyy-MM-dd'));
        router.push(`${basePath}?${qs}`);
    };

    return (
        <PeriodNav
            label={label}
            onPrev={() => pushDay(subDays(current, 1))}
            onNext={() => pushDay(addDays(current, 1))}
            onLabelClick={chrome ? () => chrome.openFilter() : undefined}
            prevAriaLabel="Día anterior"
            nextAriaLabel="Día siguiente"
        />
    );
}

export function DayPeriodFilter({
    day,
    basePath,
    instance,
}: {
    day: string | null | undefined;
    basePath: string;
    instance: string;
}) {
    const chrome = use(DayPeriodChromeContext);
    const router = useRouter();
    const searchParams = useSearchParams();
    const [open, setOpen] = useState(false);
    const current = parseDay(day);

    const apply = (v: TimeFilterValue) => {
        if (v.kind !== 'date') return;
        const qs = withDay(searchParams.toString(), v.date);
        router.push(`${basePath}?${qs}`);
    };

    if (chrome) {
        return <PeriodFilterButton instance={instance} onClick={() => chrome.openFilter()} />;
    }

    return (
        <>
            <PeriodFilterButton instance={instance} onClick={() => setOpen(true)} />
            <TimeFilterModal
                isOpen={open}
                onClose={() => setOpen(false)}
                onApply={apply}
                allowedKinds={['date']}
                initialValue={{ kind: 'date', date: format(current, 'yyyy-MM-dd') }}
                defaultKind="date"
            />
        </>
    );
}
