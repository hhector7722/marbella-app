'use client';

import { useState, useEffect, memo } from 'react';
import { Share_Tech_Mono } from 'next/font/google';

const digitalFont = Share_Tech_Mono({ weight: '400', subsets: ['latin'] });

/**
 * Rounding rule from the business logic (replicated here to avoid prop drilling)
 */
const applyRoundingRule = (totalMinutes: number): number => {
    if (totalMinutes <= 0) return 0;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (m <= 20) return h;
    if (m <= 50) return h + 0.5;
    return h + 1;
};

const roundHoursValue = (hours: number): number => {
    const minutes = Math.round(hours * 60);
    return applyRoundingRule(minutes);
};

/** Duración de un turno cerrado, para lectura: «7 h» / «7,5 h». */
export function formatStaffWorkedHours(totalHours: number | null | undefined): string {
    if (totalHours == null || !Number.isFinite(Number(totalHours))) return '';
    const rounded = roundHoursValue(Number(totalHours));
    if (rounded % 1 === 0) return `${rounded} h`;
    return `${rounded.toFixed(1).replace('.', ',')} h`;
}

/**
 * Cronómetro vivo del turno. El padre pinta el hueco; aquí solo van los dígitos.
 * El tick (1 s) no re-renderiza al padre.
 */
const WorkTimer = memo(function WorkTimer({ clockIn }: { clockIn: string | null }) {
    const [display, setDisplay] = useState('00:00:00');

    useEffect(() => {
        if (!clockIn) {
            setDisplay('00:00:00');
            return;
        }

        const tick = () => {
            const start = new Date(clockIn).getTime();
            const now = Date.now();
            const diff = Math.max(0, now - start);
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            setDisplay(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [clockIn]);

    return (
        <span
            className={`${digitalFont.className} text-xl leading-none tracking-widest text-red-500`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
        >
            {display}
        </span>
    );
});

export default WorkTimer;
