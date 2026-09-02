'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import DashboardShortcut from '@/components/dashboards/DashboardShortcut';
import { AccessShortcutGrid } from '@/components/dashboards/AccessShortcutGrid';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

const WEB_URL = 'https://marbella-web.vercel.app';

interface AdminMoreFunctionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenPedidos: () => void;
    onOpenCambio: () => void;
    onOpenHorarios: () => void;
    onOpenCierre: () => void;
    onOpenInfo: () => void;
    onOpenCompra: () => void;
}

type MoreFunctionsItem = {
    label: string;
    instance: string;
    img: string;
} & (
    | { href: string }
    | { action: 'pedidos' | 'cambio' | 'horarios' | 'cierre' | 'info' | 'compra' | 'web' }
);

const MORE_FUNCTIONS_ITEMS: MoreFunctionsItem[] = [
    { label: 'Carta', instance: 'carta', href: '/staff/carta', img: '/icons/menu.png' },
    { label: 'Pedidos', instance: 'staff-pedidos', action: 'pedidos', img: '/icons/shipment.png' },
    { label: 'Consumo', instance: 'consumo', href: '/dashboard/consumo-personal', img: '/icons/consum.png' },
    { label: 'Cambio', instance: 'cambio', action: 'cambio', img: '/icons/change.png' },
    { label: 'Horarios', instance: 'horarios', action: 'horarios', img: '/icons/calendar.png' },
    { label: 'Cierre', instance: 'staff-cierre', action: 'cierre', img: '/icons/lock.png' },
    { label: 'Reservas', instance: 'reservas', href: '/staff/reservas', img: '/icons/reservas.png' },
    { label: 'Propinas', instance: 'propinas', href: '/dashboard/propinas', img: '/icons/tip.png' },
    { label: 'Web', instance: 'web', action: 'web', img: '/icons/web.png' },
    { label: 'Rentabilidad', instance: 'rentabilidad', href: '/dashboard/insights', img: '/icons/rent.png' },
    { label: 'Info', instance: 'staff-info', action: 'info', img: '/icons/information.png' },
    { label: 'Compra', instance: 'staff-compra', action: 'compra', img: '/icons/shop.png' },
];

export function AdminMoreFunctionsModal({
    isOpen,
    onClose,
    onOpenPedidos,
    onOpenCambio,
    onOpenHorarios,
    onOpenCierre,
    onOpenInfo,
    onOpenCompra,
}: AdminMoreFunctionsModalProps) {
    const router = useRouter();
    const [isNavigating, setIsNavigating] = useState(false);
    const trackOtros = useTrackModalApply('admin-otros', 'Otros (admin)');

    const handleClose = () => {
        if (isNavigating) return;
        onClose();
    };

    const runAction = (label: string, action: () => void) => {
        trackOtros(label);
        onClose();
        setTimeout(action, 150);
    };

    const actionHandlers: Record<
        'pedidos' | 'cambio' | 'horarios' | 'cierre' | 'info' | 'compra' | 'web',
        () => void
    > = {
        pedidos: onOpenPedidos,
        cambio: onOpenCambio,
        horarios: onOpenHorarios,
        cierre: onOpenCierre,
        info: onOpenInfo,
        compra: onOpenCompra,
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
            usageId="admin-otros"
            usageLabel="Otros (admin)"
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
