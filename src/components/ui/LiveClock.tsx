'use client';

import { useState, useEffect, memo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * LiveClock — Isolated real-time clock component.
 * 
 * Ticks every second but keeps state local.
 * Parent never re-renders from clock updates.
 */
const LiveClock = memo(function LiveClock() {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        // Set immediately on mount to avoid blank flash
        setNow(new Date());
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!now) return null;

    return (
        <div className="flex flex-col items-center leading-tight">
            <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/90">
                {format(now, "eee d MMM", { locale: es }).replace('.', '')}
            </span>
            <span
                className="text-[10px] md:text-xs font-medium tracking-[0.1em] text-white/70"
                style={{ fontVariantNumeric: 'tabular-nums' }}
            >
                {format(now, "HH:mm:ss")}
            </span>
        </div>
    );
});

export default LiveClock;
