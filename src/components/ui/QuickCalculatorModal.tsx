'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { X, Copy, Calculator, Delete, Minus, Plus, Banknote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { DENOMINATIONS, CURRENCY_IMAGES } from '@/lib/constants';

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
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 text-center">
                                Recuento rápido (no se guarda)
                            </p>
                            <div className="space-y-2 mb-4">
                                {DENOMINATIONS.map((denom) => {
                                    const qty = breakdownCounts[denom] || 0;
                                    const subtotal = denom * qty;
                                    return (
                                        <div
                                            key={denom}
                                            className="flex items-center gap-2 p-2 bg-white rounded-xl border border-zinc-200 shadow-sm"
                                        >
                                            <div className="w-10 h-7 flex items-center justify-center shrink-0">
                                                <Image
                                                    src={CURRENCY_IMAGES[denom]}
                                                    alt={`${denom}€`}
                                                    width={48}
                                                    height={32}
                                                    className="h-full w-auto object-contain"
                                                />
                                            </div>
                                            <span className="text-[10px] font-black text-zinc-500 w-8 shrink-0">
                                                {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                                            </span>
                                            <div className="flex items-center flex-1 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleBreakdownAdjust(denom, -1)}
                                                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-200 shrink-0"
                                                >
                                                    <Minus size={16} strokeWidth={3} />
                                                </button>
                                                <span className="flex-1 text-center font-black text-zinc-800 tabular-nums text-sm min-w-0">
                                                    {qty > 0 ? qty : ' '}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleBreakdownAdjust(denom, 1)}
                                                    className="w-9 h-9 flex items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 shrink-0"
                                                >
                                                    <Plus size={16} strokeWidth={3} />
                                                </button>
                                            </div>
                                            <span className="text-[11px] font-black text-[#36606F] tabular-nums w-12 text-right shrink-0">
                                                {subtotal > 0.005 ? `${subtotal.toFixed(2)}€` : ' '}
                                            </span>
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
