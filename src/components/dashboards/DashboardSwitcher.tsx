'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

import AdminDashboardView from './AdminDashboardView';
import MasterDashboardView from './MasterDashboardView';
import StaffDashboardView from './StaffDashboardView';

export type DashboardView = 'admin' | 'master' | 'staff';

interface DashboardSwitcherProps {
    userRole: string;
    userEmail?: string | null;
    initialView?: DashboardView;
    initialData?: any;
}

export default function DashboardSwitcher({
    userRole,
    userEmail,
    initialView = 'staff',
    initialData,
}: DashboardSwitcherProps) {
    const router = useRouter();
    const isTriple = userRole === 'manager' && isMasterDashboardUser(userEmail);
    const [view, setView] = useState<DashboardView>(initialView);
    const [offsetX, setOffsetX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const isHorizontalDrag = useRef<boolean | null>(null);
    const dragActivated = useRef(false);
    const containerWidth = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const DRAG_DEAD_ZONE = 10;
    const isManager = userRole === 'manager';

    useEffect(() => {
        setView(initialView);
    }, [initialView]);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!isManager) return;
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        isHorizontalDrag.current = null;
        dragActivated.current = false;
        if (containerRef.current) {
            containerWidth.current = containerRef.current.offsetWidth;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isManager) return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - startX.current;
        const diffY = currentY - startY.current;

        if (!dragActivated.current) {
            if (Math.abs(diffX) < DRAG_DEAD_ZONE && Math.abs(diffY) < DRAG_DEAD_ZONE) {
                return;
            }
            if (Math.abs(diffX) > Math.abs(diffY)) {
                isHorizontalDrag.current = true;
                dragActivated.current = true;
                setIsDragging(true);
            } else {
                isHorizontalDrag.current = false;
                dragActivated.current = true;
                return;
            }
        }

        if (isHorizontalDrag.current) {
            if (e.cancelable) e.preventDefault();

            let controlledDiff = diffX;
            if (isTriple) {
                if (view === 'admin' && diffX > 0) controlledDiff = diffX * 0.2;
                if (view === 'staff' && diffX < 0) controlledDiff = diffX * 0.2;
            } else {
                if (view === 'admin' && diffX > 0) controlledDiff = diffX * 0.2;
                if (view === 'staff' && diffX < 0) controlledDiff = diffX * 0.2;
            }

            setOffsetX(controlledDiff);
        }
    };

    const navigateToView = (next: DashboardView) => {
        setView(next);
        if (next === 'admin') router.replace('/dashboard');
        else if (next === 'master') router.replace('/master/dashboard');
        else router.replace('/staff/dashboard');
    };

    const handleTouchEnd = () => {
        if (!dragActivated.current) return;
        setIsDragging(false);
        dragActivated.current = false;

        const threshold = containerWidth.current / 4;

        if (Math.abs(offsetX) > threshold) {
            if (isTriple) {
                if (offsetX < 0) {
                    if (view === 'admin') navigateToView('master');
                    else if (view === 'master') navigateToView('staff');
                } else if (offsetX > 0) {
                    if (view === 'staff') navigateToView('master');
                    else if (view === 'master') navigateToView('admin');
                }
            } else {
                if (offsetX < 0 && view === 'admin') navigateToView('staff');
                else if (offsetX > 0 && view === 'staff') navigateToView('admin');
            }
        }

        setOffsetX(0);
        isHorizontalDrag.current = null;
    };

    const viewIndex = isTriple
        ? view === 'admin' ? 0 : view === 'master' ? 1 : 2
        : view === 'admin' ? 0 : 1;
    // margin-left % es relativo al ancho del contenedor (viewport), no al track.
    // Cada panel ocupa 1 viewport: admin=0%, master=-100%, staff=-200% (triple) o -100% (dual).
    const currentTranslate = isManager ? -viewIndex * 100 : 0;
    const dragTranslatePercent = isManager ? (offsetX / (containerWidth.current || 1)) * 100 : 0;
    const finalTranslate = isManager ? currentTranslate + dragTranslatePercent : 0;

    const trackWidth = isTriple ? '300%' : isManager ? '200%' : '100%';
    const panelClass = isTriple ? 'w-1/3' : isManager ? 'w-1/2' : 'w-full';

    const shouldRenderPanel = (panel: DashboardView) => view === panel || isDragging;

    return (
        <div
            ref={containerRef}
            className={cn(
                'w-full min-h-full overflow-x-hidden overflow-y-auto relative',
                isManager ? 'touch-pan-y' : ''
            )}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className={cn(
                    'flex min-h-full',
                    isManager ? 'transition-[margin-left] duration-300 ease-out' : 'w-full',
                    isDragging && isHorizontalDrag.current && 'duration-0'
                )}
                style={isManager ? { width: trackWidth, marginLeft: `${finalTranslate}%` } : {}}
            >
                {isTriple ? (
                    <>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 -mt-0.5 md:mt-0')}>
                            {shouldRenderPanel('admin') && <AdminDashboardView initialData={initialData} />}
                        </div>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 mt-4 md:mt-0')}>
                            {shouldRenderPanel('master') && (
                                <MasterDashboardView
                                    initialData={{
                                        liveTickets: initialData?.liveTickets,
                                        salesChartData: initialData?.salesChartData,
                                        actualBalance: initialData?.actualBalance,
                                        boxes: initialData?.boxes,
                                        allEmployees: initialData?.allEmployees,
                                    }}
                                />
                            )}
                        </div>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 mt-4 md:mt-0')}>
                            {shouldRenderPanel('staff') && <StaffDashboardView />}
                        </div>
                    </>
                ) : isManager ? (
                    <>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 -mt-0.5 md:mt-0')}>
                            {shouldRenderPanel('admin') && <AdminDashboardView initialData={initialData} />}
                        </div>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 mt-4 md:mt-0')}>
                            {shouldRenderPanel('staff') && <StaffDashboardView />}
                        </div>
                    </>
                ) : (
                    <div className="w-full min-h-full flex-shrink-0 mt-4 md:mt-0">
                        <StaffDashboardView />
                    </div>
                )}
            </div>

            {isManager && (
                <div className="fixed bottom-[88px] left-0 right-0 flex md:hidden justify-center gap-1 z-50 pointer-events-none">
                    {(isTriple ? (['admin', 'master', 'staff'] as const) : (['admin', 'staff'] as const)).map((panel) => (
                        <div
                            key={panel}
                            className={cn(
                                'w-1 h-1 rounded-full transition-all duration-300',
                                view === panel ? 'bg-white scale-110' : 'bg-white/30'
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
