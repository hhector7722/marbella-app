'use client';

import { useEffect, useRef } from 'react';

interface SwipeConfig {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    threshold?: number;
}

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight, threshold = 100 }: SwipeConfig) {
    const touchStart = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const handleTouchStart = (e: TouchEvent) => {
            touchStart.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            };
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (!touchStart.current) return;

            const touchEnd = {
                x: e.changedTouches[0].clientX,
                y: e.changedTouches[0].clientY
            };

            const dx = touchEnd.x - touchStart.current.x;
            const dy = touchEnd.y - touchStart.current.y;

            // Asegurarnos de que sea principalmente horizontal
            if (Math.abs(dx) > Math.abs(dy) * 2) {
                if (Math.abs(dx) > threshold) {
                    if (dx > 0) {
                        onSwipeRight?.();
                    } else {
                        onSwipeLeft?.();
                    }
                }
            }

            touchStart.current = null;
        };

        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchend', handleTouchEnd);

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [onSwipeLeft, onSwipeRight, threshold]);
}
