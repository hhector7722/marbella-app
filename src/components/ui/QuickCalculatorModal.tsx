'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { X, Copy, Calculator, Delete, Minus, Plus, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DENOMINATIONS, CURRENCY_IMAGES } from '@/lib/constants';
import { DenominationZoomModal } from '@/components/ui/DenominationZoomModal';

type ModalTab = 'calculator' | 'breakdown';

/** Evalúa una expresión numérica segura (solo dígitos, ., +, -, *, /). */
function safeEval(expr: string): number | null {
    const trimmed = expr.replace(/\s/g, '');
    if (!trimmed) return null;
    if (!/^[\d.+*\-/]+$/.test(trimmed)) return null;
    try {
        const result = Function('"use strict"; return (' + trimmed + ')')();
        return typeof result === 'number' && Number.isFinite(result) ? result : null;
    } catch {
        return null;
    }
}

interface QuickCalculatorModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const BTN_VALUES: (string | 'back')[][] = [
    ['C', 'back', '±', '%', '/'],
    ['7', '8', '9', '*'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['.', '0', '=', ''],
];

export function QuickCalculatorModal({ isOpen, onClose }: QuickCalculatorModalProps) {
    const [tab, setTab] = useState<ModalTab>('calculator');
    const [display, setDisplay] = useState('');
    const [result, setResult] = useState<number | null>(null);
    const [breakdownCounts, setBreakdownCounts] = useState<Record<number, number>>({});
    const [zoomDenom, setZoomDenom] = useState<number | null>(null);

    const handlePress = useCallback((key: string) => {
        if (key === 'C') {
            setDisplay('');
            setResult(null);
            return;
        }
        if (key === 'back') {
            setResult(null);
            setDisplay((prev) => prev.slice(0, -1));
            return;
        }
        if (key === '=') {
            const val = safeEval(display);
            setResult(val);
            if (val !== null) setDisplay(String(val));
            return;
        }
        if (key === '±') {
            const val = safeEval(display);
            if (val !== null) setDisplay(String(-val));
            return;
        }
        if (key === '%') {
            const val = safeEval(display);
            if (val !== null) setDisplay(String(val / 100));
            return;
        }
        if (key === '' || key === 'back') return;
        setResult(null);
        setDisplay((prev) => prev + key);
    }, [display]);

    const handleCopy = useCallback(() => {
        const toCopy = result !== null ? String(result) : (display || '0');
        navigator.clipboard.writeText(toCopy).then(() => {
            toast.success('Resultado copiado al portapapeles');
        }).catch(() => {
            toast.error('No se pudo copiar');
        });
    }, [result, display]);

    const breakdownTotal = DENOMINATIONS.reduce((sum, d) => sum + d * (breakdownCounts[d] || 0), 0);
    const handleBreakdownAdjust = useCallback((denom: number, delta: number) => {
        setBreakdownCounts((prev) => ({
            ...prev,
            [denom]: Math.max(0, (prev[denom] || 0) + delta),
        }));
    }, []);
    const handleBreakdownCountChange = useCallback((denom: number, value: string) => {
        const num = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0);
        setBreakdownCounts((prev) => ({ ...prev, [denom]: num }));
    }, []);
    const handleBreakdownCopy = useCallback(() => {
        navigator.clipboard.writeText(breakdownTotal.toFixed(2)).then(() => {
            toast.success('Total copiado al portapapeles');
        }).catch(() => toast.error('No se pudo copiar'));
    }, [breakdownTotal]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className={cn(
                    'bg-white rounded-2xl shadow-2xl overflow-hidden w-full animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]',
                    tab === 'breakdown' ? 'max-w-[320px]' : 'max-w-[280px]'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#36606F] px-3 py-2 flex items-center justify-between text-white shrink-0">
                    <div className="flex rounded-xl bg-white/10 p-0.5 gap-0.5">
                        <button
                            type="button"
                            onClick={() => setTab('calculator')}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all min-h-[40px]',
                                tab === 'calculator' ? 'bg-white text-[#36606F]' : 'text-white/80 hover:text-white'
                            )}
                        >
                            Calculadora
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('breakdown')}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all min-h-[40px] flex items-center gap-1',
                                tab === 'breakdown' ? 'bg-white text-[#36606F]' : 'text-white/80 hover:text-white'
                            )}
                        >
                            <Banknote size={14} />
                            Desglose
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10 text-white min-h-[44px] min-w-[44px] shrink-0"
                        aria-label="Cerrar"
                    >
                        <X size={18} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-4 bg-zinc-50 flex-1 overflow-y-auto min-h-0">
                    {tab === 'calculator' && (
                        <>
                            <div className="h-12 bg-white rounded-xl border border-zinc-200 px-3 flex items-center justify-end mb-3">
                                <span className="text-xl font-black tabular-nums text-zinc-800 truncate max-w-full">
                                    {display || '0'}
                                </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5 mb-3">
                                {BTN_VALUES.flat().map((key, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => handlePress(key)}
                                        className={cn(
                                            'min-h-[48px] rounded-xl font-black text-sm transition-all active:scale-95 flex items-center justify-center',
                                            key === 'C' && 'bg-rose-100 text-rose-700 hover:bg-rose-200',
                                            key === 'back' && 'bg-rose-500 text-white hover:bg-rose-600',
                                            key === '±' && 'bg-orange-100 text-orange-700 hover:bg-orange-200',
                                            key === '%' && 'bg-orange-100 text-orange-700 hover:bg-orange-200',
                                            ['+', '-', '*', '/'].includes(key) && 'bg-[#36606F] text-white hover:bg-[#2d4d57]',
                                            key === '=' && 'bg-emerald-500 text-white hover:bg-emerald-600',
                                            !['C', 'back', '=', ''].includes(key) && !['+', '-', '*', '/', '%', '±'].includes(key) && 'bg-white border border-zinc-200 text-zinc-800 hover:bg-zinc-50',
                                            key === '' && 'invisible pointer-events-none'
                                        )}
                                    >
                                        {key === 'back' ? <Delete size={18} strokeWidth={2.5} /> : (key || '')}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="w-full min-h-[48px] rounded-xl bg-emerald-500 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-emerald-600 active:scale-[0.98] shadow-md"
                            >
                                <Copy size={16} />
                                Copiar resultado
                            </button>
                        </>
                    )}
                    {tab === 'breakdown' && (
                        <>
                            {zoomDenom !== null && (
                                <DenominationZoomModal
                                    isOpen={true}
                                    onClose={() => setZoomDenom(null)}
                                    denomination={zoomDenom}
                                    value={breakdownCounts[zoomDenom] || 0}
                                    onValueChange={(v) => setBreakdownCounts((prev) => ({ ...prev, [zoomDenom]: v }))}
                                />
                            )}
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5 mb-3">
                                {DENOMINATIONS.map((denom) => {
                                    const qty = breakdownCounts[denom] || 0;
                                    return (
                                        <div key={denom} className="flex flex-col items-center gap-1 group transition-all">
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setZoomDenom(denom)}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setZoomDenom(denom); }}
                                                className="w-full h-11 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-110 cursor-pointer rounded-lg hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]/40 focus:ring-offset-1 min-h-[48px]"
                                                aria-label={`Editar cantidad de ${denom >= 1 ? `${denom} euros` : `${(denom * 100).toFixed(0)} céntimos`}`}
                                            >
                                                <Image
                                                    src={CURRENCY_IMAGES[denom]}
                                                    alt={`${denom}€`}
                                                    width={140}
                                                    height={140}
                                                    className="h-full w-auto object-contain drop-shadow-lg pointer-events-none"
                                                />
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">
                                                    {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                                                </span>
                                                <div className="flex items-center justify-between w-full h-10 min-h-[48px] bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleBreakdownAdjust(denom, -1)}
                                                        className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"
                                                    >
                                                        <Minus size={14} strokeWidth={3} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={qty > 0 ? qty : ''}
                                                        onChange={(e) => handleBreakdownCountChange(denom, e.target.value)}
                                                        placeholder=""
                                                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleBreakdownAdjust(denom, 1)}
                                                        className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"
                                                    >
                                                        <Plus size={14} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex items-center justify-between gap-2 p-3 bg-[#36606F] rounded-xl mb-3">
                                <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">Total</span>
                                <span className="text-lg font-black text-white tabular-nums">
                                    {breakdownTotal > 0.005 ? `${breakdownTotal.toFixed(2)}€` : ' '}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleBreakdownCopy}
                                className="w-full min-h-[48px] rounded-xl bg-emerald-500 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-emerald-600 active:scale-[0.98] shadow-md"
                            >
                                <Copy size={16} />
                                Copiar total
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/** Botón discreto para cabecera de modal: abre la calculadora. Colocar a la izquierda de la X si hay cierre, o como elemento más a la derecha. */
export function CalculatorHeaderButton({
    isOpen,
    onToggle,
    className,
    ariaLabel = 'Abrir calculadora',
}: {
    isOpen: boolean;
    onToggle: () => void;
    className?: string;
    ariaLabel?: string;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={ariaLabel}
            className={cn(
                'w-10 h-10 flex items-center justify-center rounded-xl min-h-[48px] min-w-[48px] shrink-0',
                'text-white/80 hover:text-white hover:bg-white/10 transition-all active:scale-95',
                className
            )}
        >
            <Calculator size={20} strokeWidth={2.5} />
        </button>
    );
}
