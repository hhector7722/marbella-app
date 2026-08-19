'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

interface AdminProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSupplierModal: () => void;
}

type AdminMenuItem =
    | { title: string; hover: string; special: 'pedidos' }
    | { title: string; hover: string; href: string; img: string };

const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
    { title: 'Recetas', href: '/recipes', img: '/icons/recipes.png', hover: 'hover:bg-red-50/30' },
    { title: 'Ingredientes', href: '/ingredients', img: '/icons/ingrediente.png', hover: 'hover:bg-orange-50/30' },
    { title: 'Pedidos', hover: 'hover:bg-emerald-50/30', special: 'pedidos' },
    { title: 'Inventario', href: '/dashboard/inventory', hover: 'hover:bg-purple-50/30', img: '/icons/inventory.png' },
    { title: 'Mermas', href: '/dashboard/inventory/waste', hover: 'hover:bg-orange-50/30', img: '/icons/bin.png' },
    { title: 'Stock', href: '/dashboard/inventory/ledger', hover: 'hover:bg-violet-50/30', img: '/icons/productes.png' },
    { title: 'Carta', href: '/staff/carta', hover: 'hover:bg-blue-50/30', img: '/icons/menu.png' },
    { title: 'Albaranes', href: '/dashboard/albaranes', hover: 'hover:bg-zinc-100/30', img: '/icons/scan.png' },
    { title: 'Consumo Personal', href: '/dashboard/consumo-personal', hover: 'hover:bg-emerald-50/30', img: '/icons/consum.png' },
    { title: 'Proveedores', href: '/suppliers', img: '/icons/suplier.png', hover: 'hover:bg-zinc-100/30' },
];

export function AdminProductModal({ isOpen, onClose, onOpenSupplierModal }: AdminProductModalProps) {
    const pathname = usePathname();
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
            headerVariant="petroleum"
            usageId="admin-product"
            usageLabel="Menú stock (admin)"
            wrapperClassName="max-w-md"
            scrollContent={false}
        >
            <div className="relative p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                {ADMIN_MENU_ITEMS.map((item, i) => {
                    if ('special' in item && item.special === 'pedidos') {
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => {
                                    trackAdminProduct(item.title);
                                    onClose();
                                    setTimeout(() => onOpenSupplierModal(), 150);
                                }}
                                className={cn(
                                    'bg-transparent border-0 p-4 rounded-2xl flex flex-col items-center gap-3 group transition-all active:scale-95 cursor-pointer',
                                    item.hover,
                                )}
                            >
                                <div className="w-12 h-12 transition-transform group-hover:scale-110">
                                    <Image
                                        src="/icons/shipment.png"
                                        alt="Pedidos"
                                        width={48}
                                        height={48}
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <span className="font-black text-sm text-gray-700">{item.title}</span>
                            </button>
                        );
                    }

                    if (!('href' in item) || !('img' in item)) return null;

                    const isActive = pathname === item.href;
                    const baseClass = cn(
                        'bg-transparent border-0 p-4 rounded-2xl flex flex-col items-center gap-3 group transition-all active:scale-95 text-center no-underline',
                        item.hover,
                        isActive && 'ring-2 ring-[#36606F]/40 bg-white shadow-sm',
                    );
                    return (
                        <Link key={i} href={item.href} onClick={() => { trackAdminProduct(item.title); setIsNavigating(true); }} className={baseClass}>
                            <div className="w-12 h-12 transition-transform group-hover:scale-110">
                                <Image
                                    src={item.img}
                                    alt={item.title}
                                    width={48}
                                    height={48}
                                    className="w-full h-full object-contain"
                                />
                            </div>
                            <span className="font-black text-sm text-gray-700">{item.title}</span>
                        </Link>
                    );
                })}

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
