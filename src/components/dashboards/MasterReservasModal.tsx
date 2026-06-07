'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    'bg-white w-full rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]',
                    'max-w-md animate-in zoom-in-95 duration-200'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#36606F] px-6 py-4 text-white shrink-0 relative">
                    <h2 className="text-lg font-black uppercase tracking-wider leading-none pr-12">Reservas</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute right-4 top-1/2 -translate-y-1/2 min-h-[48px] min-w-[48px] flex items-center justify-center active:scale-95 transition-transform text-white"
                        aria-label="Cerrar"
                    >
                        <X size={20} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="p-4 space-y-3 bg-white overflow-y-auto">
                    <button
                        type="button"
                        onClick={() => go('/staff/reservas')}
                        className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 hover:bg-zinc-50 transition-all group active:scale-95 min-h-[56px]"
                    >
                        <div className="w-12 h-12 shrink-0 flex items-center justify-center">
                            <Image
                                src="/icons/reservas.png"
                                alt="Reservas"
                                width={48}
                                height={48}
                                className="object-contain transition-transform group-hover:scale-110"
                            />
                        </div>
                        <p className="min-w-0 flex-1 text-left text-sm font-black text-gray-800">Reservas</p>
                    </button>

                    <button
                        type="button"
                        onClick={() => go('/dashboard/eventos')}
                        className="flex items-center gap-4 w-full p-4 text-gray-600 hover:text-blue-600 hover:bg-zinc-50 transition-all group active:scale-95 min-h-[56px]"
                    >
                        <div className="w-12 h-12 shrink-0 flex items-center justify-center">
                            <Image
                                src="/icons/suppliers.png"
                                alt="Encargos"
                                width={48}
                                height={48}
                                className="object-contain transition-transform group-hover:scale-110"
                            />
                        </div>
                        <p className="min-w-0 flex-1 text-left text-sm font-black text-gray-800">Encargos</p>
                    </button>
                </div>
            </div>
        </div>
    );
}
