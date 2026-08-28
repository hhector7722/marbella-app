'use client';

import { useState, useEffect, memo } from 'react';
import { Share_Tech_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';

const digitalFont = Share_Tech_Mono({ weight: '400', subsets: ['latin'] });

function toHms(ms: number): string {
    const safe = Math.max(0, ms);
    const hours = Math.floor(safe / (1000 * 60 * 60));
    const minutes = Math.floor((safe % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((safe % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/** Duración real de un turno cerrado: «07:32:18». */
export function formatStaffElapsedHms(clockIn: string | null | undefined, clockOut: string | null | undefined): string {
    if (!clockIn || !clockOut) return '';
    const start = new Date(clockIn).getTime();
    const end = new Date(clockOut).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '';
    return toHms(end - start);
}

export function StaffElapsedDigits({
    value,
    tone,
}: {
    value: string;
    tone: 'live' | 'quiet';
}) {
    return (
        <span
            className={cn(
                digitalFont.className,
                'text-xl leading-none tracking-widest',
                tone === 'live' ? 'text-red-500' : 'text-zinc-700',
            )}
            style={{ fontVariantNumeric: 'tabular-nums' }}
        >
            {value || '\u00a0'}
        </span>
    );
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
            setDisplay(toHms(Date.now() - new Date(clockIn).getTime()));
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [clockIn]);

    return <StaffElapsedDigits value={display} tone="live" />;
});

export default WorkTimer;
