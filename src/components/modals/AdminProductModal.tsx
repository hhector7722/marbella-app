'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { AccessMenuGrid, CatalogTile } from '@/components/catalog/CatalogTile';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

interface AdminProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSupplierModal: () => void;
}

type AdminMenuItem =
    | { title: string; special: 'pedidos'; img: string }
    | { title: string; href: string; img: string };

const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
    { title: 'Recetas', href: '/recipes', img: '/icons/recipes.png' },
    { title: 'Ingredientes', href: '/ingredients', img: '/icons/ingrediente.png' },
    { title: 'Pedidos', special: 'pedidos', img: '/icons/shipment.png' },
    { title: 'Inventario', href: '/dashboard/inventory', img: '/icons/inventory.png' },
    { title: 'Mermas', href: '/dashboard/inventory/waste', img: '/icons/bin.png' },
    { title: 'Stock', href: '/dashboard/inventory/ledger', img: '/icons/productes.png' },
    { title: 'Carta', href: '/staff/carta', img: '/icons/menu.png' },
    { title: 'Albaranes', href: '/dashboard/albaranes', img: '/icons/scan.png' },
    { title: 'Consumo Personal', href: '/dashboard/consumo-personal', img: '/icons/consum.png' },
    { title: 'Proveedores', href: '/suppliers', img: '/icons/suplier.png' },
];

export function AdminProductModal({ isOpen, onClose, onOpenSupplierModal }: AdminProductModalProps) {
    const router = useRouter();
    const [isNavigating, setIsNavigating] = useState(false);

    const trackAdminProduct = useTrackModalApply('admin-product', 'Menú stock (admin)');

    const handleClose = () => {
        if (isNavigating) return;
        onClose();
    };

    return (
        <Modal
            open={isOpen}
            onClose={handleClose}
            title="Stock"
            variant="standard"
            headerVariant="petroleum"
            scheme="dark"
            usageId="admin-product"
            usageLabel="Menú stock (admin)"
            scrollContent={false}
        >
            <div className="relative overflow-y-auto">
                <AccessMenuGrid>
                    {ADMIN_MENU_ITEMS.map((item) => {
                        if ('special' in item && item.special === 'pedidos') {
                            return (
                                <CatalogTile
                                    key={item.title}
                                    title={item.title}
                                    imageSrc={item.img}
                                    onClick={() => {
                                        trackAdminProduct(item.title);
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
                                    trackAdminProduct(item.title);
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
