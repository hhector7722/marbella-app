'use client';

import { useState, useCallback } from 'react';
import { X, Copy, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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

const BTN_VALUES = [
    ['C', '±', '%', '/'],
    ['7', '8', '9', '*'],
    ['4', '5', '6', '-'],
    ['1', '2', '3', '+'],
    ['.', '0', '=', ''],
];

export function QuickCalculatorModal({ isOpen, onClose }: QuickCalculatorModalProps) {
    const [display, setDisplay] = useState('');
    const [result, setResult] = useState<number | null>(null);

    const handlePress = useCallback((key: string) => {
        if (key === 'C') {
            setDisplay('');
            setResult(null);
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
        if (key === '') return;
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-[280px] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#36606F] px-4 py-2.5 flex items-center justify-between text-white shrink-0">
                    <span className="text-xs font-black uppercase tracking-widest opacity-90">Calculadora</span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10 text-white min-h-[44px] min-w-[44px]"
                        aria-label="Cerrar"
                    >
                        <X size={18} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-4 bg-zinc-50">
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
                                    'min-h-[48px] rounded-xl font-black text-sm transition-all active:scale-95',
                                    key === 'C' && 'bg-rose-100 text-rose-700 hover:bg-rose-200',
                                    key === '=' && 'bg-[#5B8FB9] text-white col-span-1 hover:bg-[#4a7ea3]',
                                    ['+', '-', '*', '/'].includes(key) && 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300',
                                    !['C', '=', ''].includes(key) && !['+', '-', '*', '/'].includes(key) && 'bg-white border border-zinc-200 text-zinc-800 hover:bg-zinc-50',
                                    key === '' && 'invisible pointer-events-none'
                                )}
                            >
                                {key || ''}
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
