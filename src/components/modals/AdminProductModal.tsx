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
}

const ADMIN_MENU_ITEMS = [
    { title: 'Inventario', href: '/dashboard/inventory', img: '/icons/inventory.png' },
    { title: 'Mermas', href: '/dashboard/inventory/waste', img: '/icons/bin.png' },
    { title: 'Stock', href: '/dashboard/inventory/ledger', img: '/icons/productes.png' },
    { title: 'Proveedores', href: '/suppliers', img: '/icons/suplier.png' },
] as const;

export function AdminProductModal({ isOpen, onClose }: AdminProductModalProps) {
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
                    {ADMIN_MENU_ITEMS.map((item) => (
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
                    ))}
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
