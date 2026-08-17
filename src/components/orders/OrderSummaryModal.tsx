'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface Ingredient {
    id: string;
    name: string;
    image_url: string | null;
    unit: string;
}

interface OrderSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: (Ingredient & { quantity: number })[];
    onConfirm: () => void;
    isProcessing: boolean;
}

export function OrderSummaryModal({ isOpen, onClose, items, onConfirm, isProcessing }: OrderSummaryModalProps) {
    const [calculatorOpen, setCalculatorOpen] = useState(false);
    const [smUp, setSmUp] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 640px)');
        const sync = () => setSmUp(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    return (
        <>
            <Modal
                open={isOpen}
                onClose={onClose}
                title="Pedido"
                variant="amplify"
                layer="base"
                instance="order-summary"
                headerTone="petroleum"
                usageId="order-summary"
                usageLabel="Resumen de pedido"
                scrollContent
                footer={
                    <div className="flex w-full items-center justify-end">
                        <Button
                            type="button"
                            variant="primary"
                            instance="order-summary-continue"
                            layout={smUp ? 'hug' : 'fill'}
                            icon={<ArrowRight size={18} />}
                            disabled={isProcessing}
                            loading={isProcessing}
                            loadingLabel="Procesando..."
                            onClick={onConfirm}
                        >
                            Continuar
                        </Button>
                    </div>
                }
            >
                <table className="w-full text-left border-separate border-spacing-y-1 sm:border-spacing-y-2 table-fixed">
                    <thead>
                        <tr className="text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-zinc-100">
                            <th className="px-2 sm:px-4 py-2 sm:py-4 w-[55%]">Producto</th>
                            <th className="px-2 sm:px-4 py-2 sm:py-4 text-center w-[20%]">Cant.</th>
                            <th className="px-2 sm:px-4 py-2 sm:py-4 text-right w-[25%]">U.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item) => (
                            <tr key={item.id} className="border-b border-zinc-50 group hover:bg-zinc-50/50 transition-colors">
                                <td className="px-2 sm:px-4 py-1 sm:py-4">
                                    <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
                                        <div className="w-8 h-8 sm:w-14 sm:h-14 bg-white rounded-lg sm:rounded-xl flex items-center justify-center overflow-hidden border border-zinc-100 shrink-0">
                                            {item.image_url ? (
                                                <img src={item.image_url} className="w-full h-full object-contain p-0.5 sm:p-1" alt={item.name} />
                                            ) : (
                                                <div className="w-4 h-4 sm:w-6 sm:h-6 bg-zinc-100 rounded-full" />
                                            )}
                                        </div>
                                        <span className="font-bold text-gray-700 text-[10px] sm:text-base truncate">{item.name}</span>
                                    </div>
                                </td>
                                <td className="px-2 sm:px-4 py-1 sm:py-4 text-center">
                                    <span className="font-black text-[#36606F] text-sm sm:text-xl">{item.quantity}</span>
                                </td>
                                <td className="px-2 sm:px-4 py-1 sm:py-4 text-right">
                                    <span className="text-[7px] sm:text-xs text-gray-400 font-bold uppercase py-0.5 sm:py-1 px-1.5 sm:px-3 bg-zinc-100 rounded-full tracking-wider whitespace-nowrap">
                                        {item.unit}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Modal>
            <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
            <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
        </>
    );
}
