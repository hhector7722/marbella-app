'use client';

import { useEffect, useRef, memo } from 'react';

interface PremiumCountUpProps {
    value: number;
    suffix?: string;
    prefix?: string;
    decimals?: number;
    className?: string;
    duration?: number;
}

/**
 * PremiumCountUp — Fintech-grade numeric interpolation.
 * 
 * - EaseOutExpo curve (snappy, mechanical feel)
 * - Tabular figures (tnum) to prevent width jitter
 * - Smooth retargeting mid-animation (no reset)
 * - Pure numeric counting (no slot-machine)
 */
const PremiumCountUp = memo(function PremiumCountUp({
    value,
    suffix = '',
    prefix = '',
    decimals = 0,
    className = '',
    duration = 350,
}: PremiumCountUpProps) {
    const displayRef = useRef<HTMLSpanElement>(null);
    const animationRef = useRef<number | null>(null);
    const currentValueRef = useRef<number>(0);
    const startValueRef = useRef<number>(0);
    const targetValueRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);
    const initializedRef = useRef(false);

    // EaseOutExpo: fast start, smooth deceleration
    const easeOutExpo = (t: number): number => {
        return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
    };

    const formatValue = (val: number): string => {
        if (Math.abs(val) < 0.01 && decimals > 0) return ' ';
        if (Math.abs(val) < 0.1 && decimals === 0) return ' ';
        return `${prefix}${val.toFixed(decimals)}${suffix}`;
    };

    useEffect(() => {
        // First render: snap to value without animation
        if (!initializedRef.current) {
            initializedRef.current = true;
            currentValueRef.current = value;
            targetValueRef.current = value;
            if (displayRef.current) {
                displayRef.current.textContent = formatValue(value);
            }
            return;
        }

        // Same value: no-op
        if (value === targetValueRef.current) return;

        // Retarget: start from wherever we are now (smooth retargeting)
        startValueRef.current = currentValueRef.current;
        targetValueRef.current = value;
        startTimeRef.current = performance.now();

        // Cancel any running animation
        if (animationRef.current !== null) {
            cancelAnimationFrame(animationRef.current);
        }

        const animate = (timestamp: number) => {
            const elapsed = timestamp - startTimeRef.current;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutExpo(progress);

            const interpolated =
                startValueRef.current +
                (targetValueRef.current - startValueRef.current) * easedProgress;

            currentValueRef.current = interpolated;

            if (displayRef.current) {
                displayRef.current.textContent = formatValue(interpolated);
            }

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                currentValueRef.current = targetValueRef.current;
                animationRef.current = null;
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current !== null) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [value, duration, decimals, suffix, prefix]);

    return (
        <span
            ref={displayRef}
            className={className}
            style={{ fontVariantNumeric: 'tabular-nums' }}
        />
    );
});

export default PremiumCountUp;
