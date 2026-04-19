'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

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
    { title: 'Escáner', href: '/dashboard/scanner', hover: 'hover:bg-cyan-50/30', img: '/icons/scan.png' },
    { title: 'Stock', href: '/dashboard/inventory/ledger', hover: 'hover:bg-violet-50/30', img: '/icons/productes.png' },
    { title: 'Albaranes', href: '/dashboard/albaranes-precios', hover: 'hover:bg-zinc-100/30', img: '/icons/albaran' },
    { title: 'Consumo Personal', href: '/dashboard/consumo-personal', hover: 'hover:bg-emerald-50/30', img: '/icons/consum' },
    { title: 'Proveedores', href: '/suppliers', img: '/icons/suplier.png', hover: 'hover:bg-zinc-100/30' },
];

export function AdminProductModal({ isOpen, onClose, onOpenSupplierModal }: AdminProductModalProps) {
    const pathname = usePathname();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className={cn(
                    'bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300 w-full max-w-md'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#36606F] px-4 py-3 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Stock</h3>
                    </div>
                    <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                    {ADMIN_MENU_ITEMS.map((item, i) => {
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

                        if (!('href' in item) || !('img' in item)) return null;

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
                    })}
                </div>
            </div>
        </div>
    );
}
