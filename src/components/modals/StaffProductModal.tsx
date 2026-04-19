'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    { title: 'Escáner', href: '/dashboard/scanner', hover: 'hover:bg-cyan-50/30', img: '/icons/scan.png' },
    { title: 'Proveedores', href: '/suppliers', img: '/icons/suplier.png', hover: 'hover:bg-zinc-100/30' },
];

export function StaffProductModal({ isOpen, onClose, onOpenSupplierModal }: StaffProductModalProps) {
    const pathname = usePathname();

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#36606F] px-8 py-4 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Stock</h3>
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">
                            Gestión de Logística
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                    >
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                    {STAFF_MENU_ITEMS.map((item, i) => {
                        if ('special' in item && item.special === 'pedidos') {
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
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
                                <Link key={i} href={item.href} onClick={onClose} className={baseClass}>
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
                </div>
            </div>
        </div>
    );
}
