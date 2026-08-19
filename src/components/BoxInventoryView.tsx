'use client';

import Image from 'next/image';
import { CURRENCY_IMAGES } from '@/lib/constants';

interface BoxInventoryViewProps {
    boxName: string;
    inventory: any[];
}

export const BoxInventoryView = ({ inventory }: BoxInventoryViewProps) => {
    const total = inventory.reduce((sum, item) => sum + (item.denomination * item.quantity), 0);

    return (
        <div className="flex min-h-0 flex-1 flex-col bg-white">
            <div className="flex shrink-0 items-center justify-between border-b bg-gray-50 p-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total en Caja</span>
                <span className="text-3xl font-black text-[#5B8FB9]">{total.toFixed(2)}€</span>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 gap-3">
                    {inventory.sort((a, b) => b.denomination - a.denomination).map((item, idx) => (
                        <div key={idx} className="bg-white p-2 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm">
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 flex items-center justify-center">
                                    <Image src={CURRENCY_IMAGES[item.denomination]} alt={`${item.denomination}€`} width={40} height={40} className="object-contain" />
                                </div>
                                <span className="font-black text-gray-700 text-xs">
                                    {item.denomination < 1 ? (item.denomination * 100).toFixed(0) + 'c' : item.denomination + '€'}
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-xl font-black text-[#5B8FB9] leading-none">x{item.quantity}</span>
                                <p className="text-[8px] font-bold text-gray-300 uppercase tracking-tighter">
                                    {(item.denomination * item.quantity).toFixed(2)}€
                                </p>
                            </div>
                        </div>
                    ))}
                    {inventory.length === 0 && (
                        <div className="col-span-2 py-20 text-center">
                            <p className="text-gray-300 font-bold uppercase tracking-widest text-xs">Caja vacía</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
