'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';
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

type MoreFunctionsItem =
    | { title: string; href: string; img: string }
    | {
          title: string;
          action: 'pedidos' | 'cambio' | 'horarios' | 'cierre' | 'info' | 'compra' | 'web';
          img: string;
      };

const MORE_FUNCTIONS_ITEMS: MoreFunctionsItem[] = [
    { title: 'Carta', href: '/staff/carta', img: '/icons/menu.png' },
    { title: 'Pedidos', action: 'pedidos', img: '/icons/shipment.png' },
    { title: 'Consumo personal', href: '/dashboard/consumo-personal', img: '/icons/consum.png' },
    { title: 'Cambio', action: 'cambio', img: '/icons/change.png' },
    { title: 'Horarios', action: 'horarios', img: '/icons/calendar.png' },
    { title: 'Cierre', action: 'cierre', img: '/icons/lock.png' },
    { title: 'Reservas', href: '/staff/reservas', img: '/icons/reservas.png' },
    { title: 'Propinas', href: '/dashboard/propinas', img: '/icons/tip.png' },
    { title: 'Web', action: 'web', img: '/icons/web.png' },
    { title: 'Rentabilidad', href: '/dashboard/insights', img: '/icons/rent.png' },
    { title: 'Info', action: 'info', img: '/icons/information.png' },
    { title: 'Compra', action: 'compra', img: '/icons/shop.png' },
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
    const trackMoreFunctions = useTrackModalApply('admin-more-functions', 'Más funciones (admin)');

    const handleClose = () => {
        if (isNavigating) return;
        onClose();
    };

    const runAction = (title: string, action: () => void) => {
        trackMoreFunctions(title);
        onClose();
        setTimeout(action, 150);
    };

    return (
        <Modal
            open={isOpen}
            onClose={handleClose}
            title="Más funciones"
            variant="standard"
            headerVariant="petroleum"
            scheme="dark"
            usageId="admin-more-functions"
            usageLabel="Más funciones (admin)"
            scrollContent={false}
        >
            <div className="relative overflow-y-auto">
                <AccessMenuGrid>
                    {MORE_FUNCTIONS_ITEMS.map((item) => {
                        if ('href' in item) {
                            return (
                                <CatalogTile
                                    key={item.title}
                                    title={item.title}
                                    imageSrc={item.img}
                                    onClick={() => {
                                        trackMoreFunctions(item.title);
                                        setIsNavigating(true);
                                        router.push(item.href);
                                    }}
                                />
                            );
                        }

                        const actionHandlers: Record<(typeof item)['action'], () => void> = {
                            pedidos: onOpenPedidos,
                            cambio: onOpenCambio,
                            horarios: onOpenHorarios,
                            cierre: onOpenCierre,
                            info: onOpenInfo,
                            compra: onOpenCompra,
                            web: () => window.open(WEB_URL, '_blank', 'noopener,noreferrer'),
                        };

                        return (
                            <CatalogTile
                                key={item.title}
                                title={item.title}
                                imageSrc={item.img}
                                onClick={() => runAction(item.title, actionHandlers[item.action])}
                            />
                        );
                    })}
                </AccessMenuGrid>

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
