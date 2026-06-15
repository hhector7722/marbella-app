'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

interface StaffProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSupplierModal: () => void;
}

type StaffMenuItem =
    | { title: string; hover: string; special: 'pedidos' }
    | { title: string; hover: string; href: string; img: string };

const STAFF_MENU_ITEMS: StaffMenuItem[] = [
    { title: 'Pedidos', hover: 'hover:bg-emerald-50/30', special: 'pedidos' },
    { title: 'Inventario', href: '/dashboard/inventory', hover: 'hover:bg-purple-50/30', img: '/icons/inventory.png' },
    { title: 'Albaranes', href: '/dashboard/albaranes', hover: 'hover:bg-zinc-100/30', img: '/icons/scan.png' },
    { title: 'Proveedores', href: '/suppliers', img: '/icons/suplier.png', hover: 'hover:bg-zinc-100/30' },
];

export function StaffProductModal({ isOpen, onClose, onOpenSupplierModal }: StaffProductModalProps) {
    const pathname = usePathname();
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
            headerVariant="petroleum"
            usageId="staff-product"
            usageLabel="Menú stock (staff)"
            className="max-h-[85vh]"
            scrollContent={false}
            zIndexClass="z-[200]"
        >
            <div className="relative p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                {STAFF_MENU_ITEMS.map((item, i) => {
                    if ('special' in item && item.special === 'pedidos') {
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => {
                                    trackStaffProduct(item.title);
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

                    if ('href' in item && 'img' in item) {
                        const isActive = pathname === item.href;
                        const baseClass = cn(
                            'bg-transparent border-0 p-4 rounded-2xl flex flex-col items-center gap-3 group transition-all active:scale-95 text-center no-underline',
                            item.hover,
                            isActive && 'ring-2 ring-[#36606F]/40 bg-white shadow-sm',
                        );
                        return (
                            <Link key={i} href={item.href} onClick={() => { trackStaffProduct(item.title); setIsNavigating(true); }} className={baseClass}>
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
                    }

                    return null;
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
