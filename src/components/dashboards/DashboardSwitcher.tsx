'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import AdminDashboardView from './AdminDashboardView';
import StaffDashboardView from './StaffDashboardView';

interface DashboardSwitcherProps {
    userRole: string;
    initialView?: 'staff' | 'admin';
    initialData?: any;
}

export default function DashboardSwitcher({ userRole, initialView = 'staff', initialData }: DashboardSwitcherProps) {
    const router = useRouter();
    const [view, setView] = useState<'staff' | 'admin'>(initialView);
    const [offsetX, setOffsetX] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startX = useRef(0);
    const startY = useRef(0);
    const isHorizontalDrag = useRef<boolean | null>(null);
    const dragActivated = useRef(false);
    const containerWidth = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const DRAG_DEAD_ZONE = 10; // px de movimiento mínimo antes de activar el drag

    // Sync with initialView if it changes (e.g. on direct navigation)
    useEffect(() => {
        setView(initialView);
    }, [initialView]);

    const handleTouchStart = (e: React.TouchEvent) => {
        if (userRole !== 'manager') return;
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        isHorizontalDrag.current = null;
        dragActivated.current = false;
        // NO setIsDragging(true) aquí — dejamos que los taps pasen a los hijos
        if (containerRef.current) {
            containerWidth.current = containerRef.current.offsetWidth;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (userRole !== 'manager') return;

        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - startX.current;
        const diffY = currentY - startY.current;

        // Dead zone: no activar drag hasta que haya movimiento significativo
        if (!dragActivated.current) {
            if (Math.abs(diffX) < DRAG_DEAD_ZONE && Math.abs(diffY) < DRAG_DEAD_ZONE) {
                return; // Ignorar micro-movimientos (es un tap)
            }
            // Determinar si es horizontal o vertical
            if (Math.abs(diffX) > Math.abs(diffY)) {
                isHorizontalDrag.current = true;
                dragActivated.current = true;
                setIsDragging(true);
            } else {
                isHorizontalDrag.current = false;
                dragActivated.current = true;
                return; // Es scroll vertical, no interferir
            }
        }

        if (isHorizontalDrag.current) {
            // Evitar scroll vertical mientras se arrastra horizontalmente
            if (e.cancelable) e.preventDefault();

            // Lógica de resistencia en los bordes
            let controlledDiff = diffX;
            if (view === 'admin' && diffX > 0) controlledDiff = diffX * 0.2;
            if (view === 'staff' && diffX < 0) controlledDiff = diffX * 0.2;

            setOffsetX(controlledDiff);
        }
    };

    const handleTouchEnd = () => {
        if (!dragActivated.current) return;
        setIsDragging(false);
        dragActivated.current = false;

        const threshold = containerWidth.current / 4;

        if (Math.abs(offsetX) > threshold) {
            if (offsetX < 0 && view === 'admin') {
                setView('staff');
                router.replace('/staff/dashboard');
            } else if (offsetX > 0 && view === 'staff') {
                setView('admin');
                router.replace('/dashboard');
            }
        }

        setOffsetX(0);
        isHorizontalDrag.current = null;
    };

    // Estilos dinámicos
    const isManager = userRole === 'manager';
    const currentTranslate = view === 'admin' ? 0 : -100; // -100% del parent (= 1 viewport de desplazamiento)
    const dragTranslatePercent = isManager ? (offsetX / (containerWidth.current || 1)) * 100 : 0;
    const finalTranslate = isManager ? currentTranslate + dragTranslatePercent : 0;

    return (
        <div
            ref={containerRef}
            className={cn(
                "w-full h-full overflow-hidden relative",
                isManager ? "touch-pan-y" : ""
            )}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className={cn(
                    "flex h-full",
                    isManager ? "w-[200%] transition-[margin-left] duration-300 ease-out" : "w-full",
                    isDragging && isHorizontalDrag.current && "duration-0"
                )}
                style={isManager ? { marginLeft: `${finalTranslate}%` } : {}}
            >
                {isManager ? (
                    <>
                        <div className="w-1/2 h-full flex-shrink-0 -mt-0.5 md:mt-0">
                            {(view === 'admin' || isDragging) && <AdminDashboardView initialData={initialData} />}
                        </div>
                        <div className="w-1/2 h-full flex-shrink-0 mt-4 md:mt-0">
                            {(view === 'staff' || isDragging) && <StaffDashboardView />}
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full flex-shrink-0 mt-4 md:mt-0">
                        <StaffDashboardView />
                    </div>
                )}
            </div>

            {/* Indicadores estilo iPhone */}
            {
                isManager && (
                    <div className="fixed bottom-[88px] left-0 right-0 flex md:hidden justify-center gap-1 z-50 pointer-events-none">
                        <div className={cn(
                            "w-1 h-1 rounded-full transition-all duration-300",
                            view === 'admin' ? "bg-white scale-110" : "bg-white/30"
                        )} />
                        <div className={cn(
                            "w-1 h-1 rounded-full transition-all duration-300",
                            view === 'staff' ? "bg-white scale-110" : "bg-white/30"
                        )} />
                    </div>
                )
            }
        </div >
    );
}
