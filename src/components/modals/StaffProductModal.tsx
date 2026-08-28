'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

interface StaffProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSupplierModal: () => void;
}

type StaffMenuItem =
    | { title: string; special: 'pedidos'; img: string }
    | { title: string; href: string; img: string };

const STAFF_MENU_ITEMS: StaffMenuItem[] = [
    { title: 'Pedidos', special: 'pedidos', img: '/icons/shipment.png' },
    { title: 'Inventario', href: '/dashboard/inventory', img: '/icons/inventory.png' },
    { title: 'Albaranes', href: '/dashboard/albaranes', img: '/icons/scan.png' },
    { title: 'Proveedores', href: '/suppliers', img: '/icons/suplier.png' },
];

export function StaffProductModal({ isOpen, onClose, onOpenSupplierModal }: StaffProductModalProps) {
    const router = useRouter();
    const [isNavigating, setIsNavigating] = useState(false);

    const trackStaffProduct = useTrackModalApply('staff-product', 'Menú stock (staff)');

    const handleClose = () => {
        if (isNavigating) return;
        onClose();
    };

    return (
        <Modal
            open={isOpen}
            onClose={handleClose}
            title="Stock"
            subtitle="Gestión de Logística"
            variant="standard"
            headerVariant="petroleum"
            usageId="staff-product"
            usageLabel="Menú stock (staff)"
            scrollContent={false}
        >
            <div className="relative overflow-y-auto">
                <AccessMenuGrid>
                    {STAFF_MENU_ITEMS.map((item) => {
                        if ('special' in item && item.special === 'pedidos') {
                            return (
                                <CatalogTile
                                    key={item.title}
                                    title={item.title}
                                    imageSrc={item.img}
                                    onClick={() => {
                                        trackStaffProduct(item.title);
                                        onClose();
                                        setTimeout(() => onOpenSupplierModal(), 150);
                                    }}
                                />
                            );
                        }

                        if (!('href' in item)) return null;

                        return (
                            <CatalogTile
                                key={item.title}
                                title={item.title}
                                imageSrc={item.img}
                                onClick={() => {
                                    trackStaffProduct(item.title);
                                    setIsNavigating(true);
                                    router.push(item.href);
                                }}
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
