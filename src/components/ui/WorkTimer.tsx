'use client';

import { useState, useEffect, memo } from 'react';
import { Share_Tech_Mono } from 'next/font/google';

const digitalFont = Share_Tech_Mono({ weight: '400', subsets: ['latin'] });

type WorkStatus = 'idle' | 'working' | 'finished';

interface WorkTimerProps {
    clockIn: string | null;
    status: WorkStatus;
    totalHours?: number | null;
}

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

/**
 * WorkTimer — Isolated chronometer for the Staff Dashboard.
 * 
 * Keeps its own tick state (1s interval).
 * Parent component does NOT re-render from timer ticks.
 */
const WorkTimer = memo(function WorkTimer({ clockIn, status, totalHours }: WorkTimerProps) {
    const [display, setDisplay] = useState('00:00');

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (status === 'working' && clockIn) {
            const tick = () => {
                const start = new Date(clockIn).getTime();
                const now = Date.now();
                const diff = now - start;
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setDisplay(
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                );
            };
            tick();
            interval = setInterval(tick, 1000);
        } else if (status === 'finished' && totalHours) {
            const rounded = roundHoursValue(totalHours);
            const h = Math.floor(rounded);
            const m = Math.round((rounded - h) * 60);
            setDisplay(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        } else {
            setDisplay('00:00');
        }

        return () => clearInterval(interval);
    }, [status, clockIn, totalHours]);

    if (status === 'idle') {
        return (
            <div className="w-full h-12 md:h-8 rounded-2xl md:rounded-xl bg-gray-50 border-2 md:border border-gray-100 flex items-center justify-center">
                <span className="text-[10px] md:text-xs text-gray-400 text-center uppercase font-bold tracking-tight">
                    No has fichado hoy
                </span>
            </div>
        );
    }

    return (
        <div className="w-full h-12 md:h-8 bg-gray-900 rounded-2xl md:rounded-xl border-2 md:border border-gray-700 shadow-inner flex flex-col items-center justify-center relative overflow-hidden">
            <span
                className={`${digitalFont.className} text-3xl md:text-2xl text-red-600 drop-shadow-[0_0_10px_rgba(220,38,38,0.5)] z-10 leading-none tracking-widest`}
                style={{ fontVariantNumeric: 'tabular-nums' }}
            >
                {display}
            </span>
        </div>
    );
});

export default WorkTimer;
