'use client';

import { X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface StaffProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSupplierModal: () => void;
}

export function StaffProductModal({ isOpen, onClose, onOpenSupplierModal }: StaffProductModalProps) {
    const router = useRouter();

    if (!isOpen) return null;

    const menuItems = [
        { title: 'Pedidos', img: '/icons/shipment.png', link: '/orders/new', hover: 'hover:bg-emerald-50/30' },
        { title: 'Inventario', img: '/icons/inventory.png', hover: 'hover:bg-purple-50/30' },
        { title: 'Stock', img: '/icons/productes.png', hover: 'hover:bg-blue-50/30' },
        { title: 'Proveedores', img: '/icons/suplier.png', link: '/suppliers', hover: 'hover:bg-zinc-100/30' },
    ];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
                <div className="bg-[#36606F] px-8 py-4 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Productos</h3>
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mt-1 italic">Gestión de Logística</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-4 grid grid-cols-2 gap-3 bg-gray-50/30 overflow-y-auto">
                    {menuItems.map((item, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => {
                                if (item.title === 'Pedidos') {
                                    onClose();
                                    setTimeout(() => onOpenSupplierModal(), 150);
                                } else if (item.link) {
                                    router.push(item.link);
                                } else {
                                    toast.info(`${item.title} próximamente`);
                                }
                            }}
                            className={cn(
                                "bg-transparent border-0 p-4 rounded-2xl flex flex-col items-center gap-3 group transition-all active:scale-95",
                                item.hover
                            )}
                        >
                            <div className="w-12 h-12 transition-transform group-hover:scale-110">
                                <Image src={item.img} alt={item.title} width={48} height={48} className="w-full h-full object-contain" />
                            </div>
                            <span className="font-black text-sm text-gray-700">{item.title}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
