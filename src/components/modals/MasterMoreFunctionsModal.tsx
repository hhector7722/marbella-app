'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { AccessShortcutGrid } from '@/components/dashboards/AccessShortcutGrid';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

/** 4 columnas × 3 filas: lo que cabe en el modal sin scroll. */
const PAGE_SIZE = 12;
const SWIPE_THRESHOLD_PX = 48;

const WEB_URL = 'https://marbella-web.vercel.app';

interface MasterMoreFunctionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenCierre: () => void;
    onOpenAlbaranes: () => void;
}

type MoreFunctionsItem = {
    label: string;
    instance: string;
    img: string;
} & (
    | { href: string }
    | { action: 'cierre' | 'web' | 'albaranes' }
);

const MORE_FUNCTIONS_ITEMS: MoreFunctionsItem[] = [
    { label: 'Proveedores', instance: 'proveedores', href: '/suppliers', img: '/icons/suplier.png' },
    { label: 'Web', instance: 'web', action: 'web', img: '/icons/web.png' },
    { label: 'Carta', instance: 'carta', href: '/staff/carta', img: '/icons/menu.png' },
    { label: 'Consumo', instance: 'consumo', href: '/dashboard/consumo-personal', img: '/icons/consum.png' },
    { label: 'Horarios', instance: 'horarios', href: '/horario', img: '/icons/schedule.png' },
    { label: 'Asistencia', instance: 'asistencia', href: '/staff/history', img: '/icons/calendar.png' },
    { label: 'Cierre', instance: 'cierre', action: 'cierre', img: '/icons/lock.png' },
    { label: 'Propinas', instance: 'propinas', href: '/dashboard/propinas', img: '/icons/tip.png' },
    { label: 'Uso app', instance: 'uso-app', href: '/dashboard/uso', img: '/icons/uso.png' },
    { label: 'Rentabilidad', instance: 'rentabilidad', href: '/dashboard/insights', img: '/icons/rent.png' },
    { label: 'Albaranes', instance: 'albaranes', action: 'albaranes', img: '/icons/scan.png' },
    { label: 'Altas', instance: 'altas', href: '/dashboard/altas', img: '/icons/staff-card.png' },
    { label: 'Vitrina', instance: 'vitrina', href: '/master/carta', img: '/icons/menu2.png' },
    { label: 'Inventario', instance: 'inventario', href: '/dashboard/inventory', img: '/icons/inventory.png' },
    { label: 'Stock', instance: 'stock', href: '/dashboard/inventory/ledger', img: '/icons/productes.png' },
];

export function MasterMoreFunctionsModal({
    isOpen,
    onClose,
    onOpenCierre,
    onOpenAlbaranes,
}: MasterMoreFunctionsModalProps) {
    const router = useRouter();
    const [isNavigating, setIsNavigating] = useState(false);
    const [page, setPage] = useState(0);
    const trackOtros = useTrackModalApply('master-otros', 'Otros (master)');
    const gesture = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
    const suppressClick = useRef(false);

    const pages: MoreFunctionsItem[][] = [];
    for (let index = 0; index < MORE_FUNCTIONS_ITEMS.length; index += PAGE_SIZE) {
        pages.push(MORE_FUNCTIONS_ITEMS.slice(index, index + PAGE_SIZE));
    }
    const pageCount = pages.length;
    const activePage = Math.min(page, pageCount - 1);

    const handleClose = () => {
        if (isNavigating) return;
        setPage(0);
        onClose();
    };

    const goToPage = (next: number) => {
        setPage(Math.max(0, Math.min(pageCount - 1, next)));
    };

    const runAction = (label: string, action: () => void) => {
        trackOtros(label);
        onClose();
        setTimeout(action, 150);
    };

    const actionHandlers: Record<'cierre' | 'web' | 'albaranes', () => void> = {
        cierre: onOpenCierre,
        web: () => window.open(WEB_URL, '_blank', 'noopener,noreferrer'),
        albaranes: onOpenAlbaranes,
    };

    return (
        <Modal
            open={isOpen}
            onClose={handleClose}
            title="Otros"
            variant="standard"
            scheme="dark"
            usageId="master-otros"
            usageLabel="Otros (master)"
            scrollContent={false}
        >
            <div className="relative">
                <div
                    className="w-full min-w-0 overflow-hidden"
                    style={{ touchAction: 'pan-y' }}
                    onPointerDown={(event) => {
                        if (event.pointerType === 'mouse' && event.button !== 0) return;
                        gesture.current = { x: event.clientX, y: event.clientY, axis: null };
                    }}
                    onPointerMove={(event) => {
                        const current = gesture.current;
                        if (!current || current.axis) return;
                        const dx = event.clientX - current.x;
                        const dy = event.clientY - current.y;
                        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                        current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
                    }}
                    onPointerUp={(event) => {
                        const current = gesture.current;
                        gesture.current = null;
                        if (!current || current.axis !== 'x') return;
                        const dx = event.clientX - current.x;
                        if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
                        suppressClick.current = true;
                        goToPage(activePage + (dx < 0 ? 1 : -1));
                    }}
                    onPointerCancel={() => {
                        gesture.current = null;
                    }}
                    onClickCapture={(event) => {
                        if (!suppressClick.current) return;
                        suppressClick.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                >
                    <div
                        className="flex w-full transition-transform duration-300 ease-out"
                        style={{ transform: `translateX(-${activePage * 100}%)` }}
                    >
                        {pages.map((pageItems, pageIndex) => (
                            <div key={pageIndex} className="w-full shrink-0" aria-hidden={pageIndex !== activePage}>
                                <AccessShortcutGrid>
                                    {pageItems.map((item) => {
                                        if ('href' in item) {
                                            return (
                                                <DashboardShortcut
                                                    key={item.instance}
                                                    instance={item.instance}
                                                    label={item.label}
                                                    img={item.img}
                                                    onClick={() => {
                                                        trackOtros(item.label);
                                                        setIsNavigating(true);
                                                        router.push(item.href);
                                                    }}
                                                />
                                            );
                                        }

                                        return (
                                            <DashboardShortcut
                                                key={item.instance}
                                                instance={item.instance}
                                                label={item.label}
                                                img={item.img}
                                                onClick={() => runAction(item.label, actionHandlers[item.action])}
                                            />
                                        );
                                    })}
                                </AccessShortcutGrid>
                            </div>
                        ))}
                    </div>
                </div>

                {pageCount > 1 ? (
                    <div className="flex items-center justify-center" role="tablist" aria-label="Páginas de otros">
                        {pages.map((_, pageIndex) => {
                            const selected = pageIndex === activePage;
                            return (
                                <button
                                    key={pageIndex}
                                    type="button"
                                    role="tab"
                                    aria-selected={selected}
                                    aria-label={`Página ${pageIndex + 1} de ${pageCount}`}
                                    className="flex h-12 w-12 shrink-0 items-center justify-center"
                                    onClick={() => goToPage(pageIndex)}
                                >
                                    <span
                                        className={
                                            selected
                                                ? 'block h-2 w-2 rounded-full bg-[var(--color-texto-invertido)]'
                                                : 'block h-1.5 w-1.5 rounded-full bg-[var(--color-texto-invertido)] opacity-40'
                                        }
                                    />
                                </button>
                            );
                        })}
                    </div>
                ) : null}

                {isNavigating && (
                    <div
                        className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/85 backdrop-blur-[2px]"
                        aria-live="polite"
                        aria-busy="true"
                    >
                        <Loader2 className="h-10 w-10 animate-spin text-[#36606F]" strokeWidth={2.5} />
                        <span className="text-xs font-black uppercase tracking-wider text-[#36606F]/80">Cargando…</span>
                    </div>
                )}
            </div>
        </Modal>
    );
}