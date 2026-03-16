'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const PULL_THRESHOLD_PX = 56;
const MAX_PULL_PX = 80;

interface PullToRefreshProps {
    children: React.ReactNode;
    className?: string;
    /** Si es false, no se muestra el indicador ni se hace refresh (ej. login). */
    enabled?: boolean;
}

export function PullToRefresh({ children, className, enabled = true }: PullToRefreshProps) {
    const router = useRouter();
    const [pullY, setPullY] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const startY = useRef(0);
    const startScrollTop = useRef(0);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (!enabled) return;
            startY.current = e.touches[0].clientY;
            startScrollTop.current = window.scrollY ?? document.documentElement.scrollTop;
        },
        [enabled]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!enabled || isRefreshing) return;
            const scrollTop = window.scrollY ?? document.documentElement.scrollTop;
            if (scrollTop > 0) {
                setPullY(0);
                return;
            }
            const currentY = e.touches[0].clientY;
            const delta = currentY - startY.current;
            if (delta > 0) {
                const damped = Math.min(delta * 0.5, MAX_PULL_PX);
                setPullY(damped);
            } else {
                setPullY(0);
            }
        },
        [enabled, isRefreshing]
    );

    const handleTouchEnd = useCallback(() => {
        if (!enabled) return;
        if (pullY >= PULL_THRESHOLD_PX && !isRefreshing) {
            setIsRefreshing(true);
            setPullY(0);
            router.refresh();
            setTimeout(() => setIsRefreshing(false), 800);
        } else {
            setPullY(0);
        }
    }, [enabled, pullY, isRefreshing, router]);

    if (!enabled) {
        return <>{children}</>;
    }

    return (
        <div
            className={cn('relative min-h-full', className)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        >
            {/* Mismo indicador que carga de página (LoadingSpinner): solo visible al tirar o durante refresh */}
            <div
                className={cn(
                    'pointer-events-none absolute left-0 right-0 top-0 z-10 flex min-h-12 items-center justify-center gap-2 transition-all duration-200',
                    pullY > 0 || isRefreshing ? 'opacity-100' : 'opacity-0'
                )}
                style={{
                    transform: pullY > 0 ? `translateY(${Math.min(pullY, MAX_PULL_PX)}px)` : 'translateY(0)',
                }}
            >
                <div className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-white/90 shadow-sm">
                    {isRefreshing ? (
                        <LoadingSpinner size="md" className="text-[#5B8FB9]" />
                    ) : (
                        <RefreshCw
                            className={cn('h-6 w-6 text-[#5B8FB9]', pullY >= PULL_THRESHOLD_PX && 'text-emerald-600')}
                            aria-hidden
                        />
                    )}
                </div>
                {!isRefreshing && (
                    <span className="text-sm font-medium text-white drop-shadow-md">
                        {pullY >= PULL_THRESHOLD_PX ? 'Suelta para actualizar' : 'Desliza para actualizar'}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
}
