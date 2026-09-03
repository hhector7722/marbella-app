'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { AccessShortcutGrid } from '@/components/dashboards/AccessShortcutGrid';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

const WEB_URL = 'https://marbella-web.vercel.app';

interface MasterMoreFunctionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenCierre: () => void;
    onOpenPlantilla: () => void;
}

type MoreFunctionsItem = {
    label: string;
    instance: string;
    img: string;
} & (
    | { href: string }
    | { action: 'cierre' | 'plantilla' | 'web' }
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
    { label: 'Recetas', instance: 'recetas', href: '/recipes', img: '/icons/recipes.png' },
    { label: 'Rentabilidad', instance: 'rentabilidad', href: '/dashboard/insights', img: '/icons/rent.png' },
    { label: 'Plantilla', instance: 'plantilla', action: 'plantilla', img: '/icons/admin.png' },
];

export function MasterMoreFunctionsModal({
    isOpen,
    onClose,
    onOpenCierre,
    onOpenPlantilla,
}: MasterMoreFunctionsModalProps) {
    const router = useRouter();
    const [isNavigating, setIsNavigating] = useState(false);
    const trackOtros = useTrackModalApply('master-otros', 'Otros (master)');

    const handleClose = () => {
        if (isNavigating) return;
        onClose();
    };

    const runAction = (label: string, action: () => void) => {
        trackOtros(label);
        onClose();
        setTimeout(action, 150);
    };

    const actionHandlers: Record<'cierre' | 'plantilla' | 'web', () => void> = {
        cierre: onOpenCierre,
        plantilla: onOpenPlantilla,
        web: () => window.open(WEB_URL, '_blank', 'noopener,noreferrer'),
    };

    return (
        <Modal
            open={isOpen}
            onClose={handleClose}
            title="Otros"
            variant="standard"
            headerVariant="petroleum"
            scheme="dark"
            usageId="master-otros"
            usageLabel="Otros (master)"
            scrollContent={false}
        >
            <div className="relative overflow-y-auto">
                <AccessShortcutGrid>
                    {MORE_FUNCTIONS_ITEMS.map((item) => {
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