'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { useMasterViewAs } from '@/components/master/MasterViewAsProvider';

/** Encima de la cápsula (mobile) o del aire inferior (desktop: --shell-bottom-inset). */
const DASHBOARD_DOTS_BOTTOM =
    'calc(var(--shell-bottom-inset) + 0.5rem)';

import StaffDashboardView from './StaffDashboardView';
import AdminDashboardView from './AdminDashboardView';
import MasterDashboardView from './MasterDashboardView';

export type DashboardView = 'admin' | 'master' | 'staff';

const PANEL_INDEX: Record<DashboardView, number> = {
    admin: 0,
    master: 1,
    staff: 2,
};

const DRAG_DEAD_ZONE = 10;
const DRAG_MOUNT_DELAY_MS = 150;
const EDGE_RESISTANCE = 0.2;
const WHEEL_AXIS_LOCK_PX = 8;
const WHEEL_IDLE_MS = 90;
const WHEEL_COOLDOWN_MS = 480;

function rubberBandOffset(view: DashboardView, diffX: number): number {
    if (view === 'admin' && diffX > 0) return diffX * EDGE_RESISTANCE;
    if (view === 'staff' && diffX < 0) return diffX * EDGE_RESISTANCE;
    return diffX;
}

function viewAfterHorizontalOffset(
    view: DashboardView,
    offsetX: number,
    isTriple: boolean,
    threshold: number,
): DashboardView | null {
    if (Math.abs(offsetX) <= threshold) return null;
    if (isTriple) {
        if (offsetX < 0) {
            if (view === 'admin') return 'master';
            if (view === 'master') return 'staff';
        } else if (offsetX > 0) {
            if (view === 'staff') return 'master';
            if (view === 'master') return 'admin';
        }
        return null;
    }
    if (offsetX < 0 && view === 'admin') return 'staff';
    if (offsetX > 0 && view === 'staff') return 'admin';
    return null;
}

function wheelDeltas(event: WheelEvent): { x: number; y: number } {
    const shiftHorizontal = event.shiftKey && event.deltaX === 0;
    const rawX = shiftHorizontal ? event.deltaY : event.deltaX;
    const rawY = shiftHorizontal ? 0 : event.deltaY;
    const scale =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerWidth : 1;
    return { x: rawX * scale, y: rawY * scale };
}

interface DashboardSwitcherProps {
    userRole: string;
    userEmail?: string | null;
    userId?: string | null;
    initialView?: DashboardView;
    initialData?: any;
}

export default function DashboardSwitcher({
    userRole,
    userEmail,
    userId,
    initialView = 'staff',
    initialData,
}: DashboardSwitcherProps) {
    const router = useRouter();
    const { identity } = useMasterViewAs();

    const resolvedRole = identity?.isViewingAs ? identity.effectiveRole : userRole;
    const resolvedEmail = identity?.isViewingAs ? identity.effectiveEmail : (userEmail ?? null);
    const resolvedUserId = identity?.isViewingAs ? identity.effectiveUserId : (userId ?? null);

    // Triple panel solo para master en su propia cuenta (manager + email master), nunca en view-as.
    const isTriple =
        !identity?.isViewingAs &&
        resolvedRole === 'manager' &&
        isMasterDashboardUser(resolvedEmail);
    const [view, setView] = useState<DashboardView>(initialView);
    const [offsetX, setOffsetX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragMountPanels, setDragMountPanels] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const isHorizontalDrag = useRef<boolean | null>(null);
    const dragActivated = useRef(false);
    const containerWidth = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragMountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const viewRef = useRef(view);
    const offsetXRef = useRef(0);
    const isTripleRef = useRef(isTriple);
    const wheelAxisRef = useRef<'x' | 'y' | null>(null);
    const wheelRawRef = useRef(0);
    const wheelIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wheelCooldownUntilRef = useRef(0);
    const [dotsPortalMounted, setDotsPortalMounted] = useState(false);
    // La pista solo puede animarse después de una interacción explícita. Así el
    // margen inicial de cada ruta se pinta de forma estática durante la hidratación.
    const [canAnimateTrack, setCanAnimateTrack] = useState(false);

    const isManager = resolvedRole === 'manager';
    viewRef.current = view;
    isTripleRef.current = isTriple;

    useEffect(() => {
        setView(initialView);
    }, [initialView]);

    useEffect(() => {
        setDotsPortalMounted(true);
        return () => {
            if (dragMountTimerRef.current) {
                clearTimeout(dragMountTimerRef.current);
            }
            if (wheelIdleTimerRef.current) {
                clearTimeout(wheelIdleTimerRef.current);
            }
        };
    }, []);

    const panelDots = isTriple
        ? (['admin', 'master', 'staff'] as const)
        : (['admin', 'staff'] as const);

    const startDragMountTimer = () => {
        if (dragMountTimerRef.current) return;
        dragMountTimerRef.current = setTimeout(() => {
            setDragMountPanels(true);
            dragMountTimerRef.current = null;
        }, DRAG_MOUNT_DELAY_MS);
    };

    const clearDragMountTimer = () => {
        if (dragMountTimerRef.current) {
            clearTimeout(dragMountTimerRef.current);
            dragMountTimerRef.current = null;
        }
        setDragMountPanels(false);
    };

    const applyOffset = (value: number) => {
        offsetXRef.current = value;
        setOffsetX(value);
    };

    const cancelWheelIdle = () => {
        if (wheelIdleTimerRef.current) {
            clearTimeout(wheelIdleTimerRef.current);
            wheelIdleTimerRef.current = null;
        }
    };

    const navigateToView = (next: DashboardView) => {
        setCanAnimateTrack(true);
        setView(next);
        if (next === 'admin') router.replace('/dashboard');
        else if (next === 'master') router.replace('/master/dashboard');
        else router.replace('/staff/dashboard');
    };

    const commitHorizontalGesture = (fromWheel = false) => {
        cancelWheelIdle();
        clearDragMountTimer();
        setIsDragging(false);
        dragActivated.current = false;

        const width = containerWidth.current || 1;
        const threshold = fromWheel ? Math.min(width / 4, 160) : width / 4;
        const next = viewAfterHorizontalOffset(
            viewRef.current,
            offsetXRef.current,
            isTripleRef.current,
            threshold,
        );
        if (next) {
            navigateToView(next);
            if (fromWheel) {
                wheelCooldownUntilRef.current = Date.now() + WHEEL_COOLDOWN_MS;
            }
        }

        applyOffset(0);
        isHorizontalDrag.current = null;
        wheelRawRef.current = 0;
        wheelAxisRef.current = null;
    };

    const commitHorizontalGestureRef = useRef(commitHorizontalGesture);
    commitHorizontalGestureRef.current = commitHorizontalGesture;

    const beginHorizontalGesture = () => {
        if (containerRef.current) {
            containerWidth.current = containerRef.current.offsetWidth;
        }
        isHorizontalDrag.current = true;
        dragActivated.current = true;
        setCanAnimateTrack(true);
        setIsDragging(true);
        startDragMountTimer();
    };

    const beginHorizontalGestureRef = useRef(beginHorizontalGesture);
    beginHorizontalGestureRef.current = beginHorizontalGesture;
    const applyOffsetRef = useRef(applyOffset);
    applyOffsetRef.current = applyOffset;

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!isManager) return;
        if (wheelAxisRef.current === 'x' || offsetXRef.current !== 0) {
            commitHorizontalGesture(true);
        }
        cancelWheelIdle();
        wheelAxisRef.current = null;
        wheelRawRef.current = 0;
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
                beginHorizontalGesture();
            } else {
                isHorizontalDrag.current = false;
                dragActivated.current = true;
                return;
            }
        }

        if (isHorizontalDrag.current) {
            if (e.cancelable) e.preventDefault();
            applyOffset(rubberBandOffset(viewRef.current, diffX));
        }
    };

    const handleTouchEnd = () => {
        if (!dragActivated.current) return;
        if (isHorizontalDrag.current) {
            commitHorizontalGesture();
            return;
        }
        dragActivated.current = false;
        isHorizontalDrag.current = null;
    };

    useEffect(() => {
        if (!isManager) return;
        const el = containerRef.current;
        if (!el) return;

        const consumeHorizontalWheel = (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) return;
            const { x, y } = wheelDeltas(event);
            if (Math.abs(x) > Math.abs(y) && event.cancelable) {
                event.preventDefault();
            }
        };

        const onWheel = (event: WheelEvent) => {
            if (event.ctrlKey || event.metaKey) return;

            const { x, y } = wheelDeltas(event);
            const mostlyHorizontal = Math.abs(x) > Math.abs(y);
            if (mostlyHorizontal && event.cancelable) event.preventDefault();

            if (dragActivated.current && wheelAxisRef.current === null) return;
            if (Date.now() < wheelCooldownUntilRef.current) return;

            if (wheelAxisRef.current === null) {
                if (Math.abs(x) < WHEEL_AXIS_LOCK_PX && Math.abs(y) < WHEEL_AXIS_LOCK_PX) {
                    return;
                }
                wheelAxisRef.current = mostlyHorizontal ? 'x' : 'y';
                if (wheelAxisRef.current === 'x') {
                    wheelRawRef.current = 0;
                    beginHorizontalGestureRef.current();
                }
            }

            if (wheelAxisRef.current !== 'x') {
                if (wheelIdleTimerRef.current) clearTimeout(wheelIdleTimerRef.current);
                wheelIdleTimerRef.current = setTimeout(() => {
                    wheelAxisRef.current = null;
                    wheelIdleTimerRef.current = null;
                }, WHEEL_IDLE_MS);
                return;
            }

            // deltaX positivo (desplazar a la derecha) equivale a deslizar a la izquierda.
            wheelRawRef.current -= x;
            applyOffsetRef.current(rubberBandOffset(viewRef.current, wheelRawRef.current));

            if (wheelIdleTimerRef.current) clearTimeout(wheelIdleTimerRef.current);
            wheelIdleTimerRef.current = setTimeout(() => {
                commitHorizontalGestureRef.current(true);
            }, WHEEL_IDLE_MS);
        };

        const wheelOpts: AddEventListenerOptions = { capture: true, passive: false };
        window.addEventListener('wheel', consumeHorizontalWheel, wheelOpts);
        el.addEventListener('wheel', onWheel, wheelOpts);
        return () => {
            window.removeEventListener('wheel', consumeHorizontalWheel, wheelOpts);
            el.removeEventListener('wheel', onWheel, wheelOpts);
            cancelWheelIdle();
        };
    }, [isManager]);

    const viewIndex = isTriple
        ? view === 'admin' ? 0 : view === 'master' ? 1 : 2
        : view === 'admin' ? 0 : 1;
    const currentTranslate = isManager ? -viewIndex * 100 : 0;
    const dragTranslatePercent = isManager ? (offsetX / (containerWidth.current || 1)) * 100 : 0;
    const finalTranslate = isManager ? currentTranslate + dragTranslatePercent : 0;

    const trackWidth = isTriple ? '300%' : isManager ? '200%' : '100%';
    const panelClass = isTriple ? 'w-1/3' : isManager ? 'w-1/2' : 'w-full';

    const shouldRenderPanel = (panel: DashboardView) => {
        if (view === panel) return true;
        // Caja inicial / H. extras / Caja cambio solo existen en /dashboard.
        if (panel === 'admin') return false;
        if (!dragMountPanels) return false;
        if (isTriple) {
            return Math.abs(PANEL_INDEX[view] - PANEL_INDEX[panel]) === 1;
        }
        return panel === 'staff';
    };

    return (
        <div
            ref={containerRef}
            className={cn(
                'dashboard-mosaic-switcher relative w-full max-w-full min-h-full overflow-x-clip overflow-y-auto overscroll-x-none',
                isManager ? 'touch-pan-y' : ''
            )}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        >
            <div
                className={cn(
                    'flex min-h-full',
                    isManager && canAnimateTrack ? 'transition-[margin-left] duration-300 ease-out' : '',
                    !isManager && 'w-full',
                    isDragging && isHorizontalDrag.current && 'duration-0'
                )}
                style={isManager ? { width: trackWidth, marginLeft: `${finalTranslate}%` } : {}}
            >
                {isTriple ? (
                    <>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 -mt-0.5 md:mt-0')}>
                            {shouldRenderPanel('admin') && (
                                <AdminDashboardView
                                    initialData={initialData}
                                    initialUserId={resolvedUserId}
                                />
                            )}
                        </div>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 -mt-0.5 md:mt-0')}>
                            {shouldRenderPanel('master') && (
                                <MasterDashboardView
                                    initialUserId={resolvedUserId}
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
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 -mt-0.5 md:mt-0')}>
                            {shouldRenderPanel('staff') && (
                                <StaffDashboardView
                                    initialUserId={resolvedUserId}
                                    initialRole={resolvedRole as any}
                                    initialEmail={resolvedEmail ?? ''}
                                />
                            )}
                        </div>
                    </>
                ) : isManager ? (
                    <>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 -mt-0.5 md:mt-0')}>
                            {shouldRenderPanel('admin') && (
                                <AdminDashboardView
                                    initialData={initialData}
                                    initialUserId={resolvedUserId}
                                />
                            )}
                        </div>
                        <div className={cn(panelClass, 'min-h-full flex-shrink-0 -mt-0.5 md:mt-0')}>
                            {shouldRenderPanel('staff') && (
                                <StaffDashboardView
                                    initialUserId={resolvedUserId}
                                    initialRole={resolvedRole as any}
                                    initialEmail={resolvedEmail ?? ''}
                                />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="w-full min-h-full flex-shrink-0 -mt-0.5 md:mt-0">
                        <StaffDashboardView
                            initialUserId={resolvedUserId}
                            initialRole={resolvedRole as any}
                            initialEmail={resolvedEmail ?? ''}
                        />
                    </div>
                )}
            </div>

            {isManager && (
                <>
                    {/* Móvil: sin cambios (solo indicador, no clicable) */}
                    <div
                        className="fixed left-0 right-0 flex md:hidden justify-center gap-1 z-50 pointer-events-none"
                        style={{ bottom: DASHBOARD_DOTS_BOTTOM }}
                    >
                        {panelDots.map((panel) => (
                            <div
                                key={panel}
                                className={cn(
                                    'w-1 h-1 rounded-full transition-all duration-300',
                                    view === panel ? 'bg-white scale-110' : 'bg-white/30'
                                )}
                            />
                        ))}
                    </div>

                    {/* Escritorio: portal a body (evita clip por overflow) + encima del bottom nav */}
                    {dotsPortalMounted &&
                        createPortal(
                            <div
                                className="fixed left-0 right-0 z-[96] hidden md:flex justify-center pointer-events-none print:hidden"
                                style={{ bottom: DASHBOARD_DOTS_BOTTOM }}
                                role="tablist"
                                aria-label="Selector de panel del dashboard"
                            >
                                <div className="flex justify-center gap-1 pointer-events-auto">
                                    {panelDots.map((panel) => (
                                        <button
                                            key={panel}
                                            type="button"
                                            onClick={() => navigateToView(panel)}
                                            className="min-h-12 min-w-12 flex items-center justify-center"
                                            role="tab"
                                            aria-selected={view === panel}
                                            aria-label={`Ir a ${panel === 'admin' ? 'Admin' : panel === 'master' ? 'Master' : 'Staff'}`}
                                        >
                                            <span
                                                className={cn(
                                                    'w-1 h-1 rounded-full transition-all duration-300',
                                                    view === panel ? 'bg-white scale-110' : 'bg-white/30'
                                                )}
                                                aria-hidden
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>,
                            document.body
                        )}
                </>
            )}
        </div>
    );
}
