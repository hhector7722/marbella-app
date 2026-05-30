'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type MasterReservasModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export default function MasterReservasModal({ isOpen, onClose }: MasterReservasModalProps) {
    const router = useRouter();

    if (!isOpen) return null;

    const go = (href: string) => {
        onClose();
        router.push(href);
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[200] p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    'bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col',
                    'max-w-md'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                    <h2 className="text-sm font-black uppercase tracking-wider text-zinc-800">Reservas</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-600 active:scale-95 transition-all"
                        aria-label="Cerrar"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="p-4 space-y-3">
                    <button
                        type="button"
                        onClick={() => go('/staff/reservas')}
                        className="flex items-center gap-4 w-full p-4 rounded-xl border border-zinc-100 bg-white shadow-sm text-gray-600 hover:text-blue-600 hover:bg-zinc-50 transition-all group active:scale-95 min-h-[56px]"
                    >
                        <div className="w-12 h-12 shrink-0 rounded-xl bg-amber-50 flex items-center justify-center p-1">
                            <Image
                                src="/icons/reservas.png"
                                alt="Reservas"
                                width={36}
                                height={36}
                                className="object-contain transition-transform group-hover:scale-110"
                            />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                            <p className="text-sm font-black text-gray-800">Reservas</p>
                            <p className="text-xs font-medium text-gray-400">Gestión de reservas</p>
                        </div>
                        <ArrowRight size={20} className="shrink-0 text-gray-400 group-hover:text-blue-600" strokeWidth={2.5} />
                    </button>

                    <button
                        type="button"
                        onClick={() => go('/dashboard/eventos')}
                        className="flex items-center gap-4 w-full p-4 rounded-xl border border-zinc-100 bg-white shadow-sm text-gray-600 hover:text-blue-600 hover:bg-zinc-50 transition-all group active:scale-95 min-h-[56px]"
                    >
                        <div className="w-12 h-12 shrink-0 rounded-xl bg-[#36606F]/10 flex items-center justify-center p-1">
                            <Image
                                src="/icons/suppliers.png"
                                alt="Encargos"
                                width={36}
                                height={36}
                                className="object-contain transition-transform group-hover:scale-110"
                            />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                            <p className="text-sm font-black text-gray-800">Encargos</p>
                            <p className="text-xs font-medium text-gray-400">Pedidos por eventos</p>
                        </div>
                        <ArrowRight size={20} className="shrink-0 text-gray-400 group-hover:text-blue-600" strokeWidth={2.5} />
                    </button>
                </div>
            </div>
        </div>
    );
}
