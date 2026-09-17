'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Copy, Delete } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DENOMINATIONS } from '@/lib/constants';
import { DenominationCountGrid } from '@/components/cash/DenominationCountGrid';
import { formatCurrencySpanish } from '@/lib/cash-closing-metrics';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';

export type QuickCashTool = 'calculator' | 'breakdown';

const CALCULATOR_ICON = '/icons/calculadora.png';
const BREAKDOWN_ICON = '/icons/desglose.png';
const INSET_VAR = '--quick-tool-inset';

/** Estética iOS pedida por producto para esta herramienta (no es cromo de Modal). */
const CALC = {
    bg: '#000000',
    num: '#333333',
    fn: '#a5a5a5',
    op: '#ff9f0a',
} as const;

type HistoryEntry = { expression: string; result: string };

function applyToolInset(px: number) {
    const root = document.documentElement;
    root.style.setProperty(INSET_VAR, `${Math.max(0, Math.round(px))}px`);
    if (px > 0) root.setAttribute('data-quick-tool', 'open');
    else root.removeAttribute('data-quick-tool');
}

function clearToolInset() {
    const root = document.documentElement;
    root.style.setProperty(INSET_VAR, '0px');
    root.removeAttribute('data-quick-tool');
}

function toEvalExpr(expr: string): string {
    return expr
        .replace(/÷/g, '/')
        .replace(/×/g, '*')
        .replace(/,/g, '.')
        .replace(/−/g, '-');
}

function safeEval(expr: string): number | null {
    const trimmed = toEvalExpr(expr).replace(/\s/g, '');
    if (!trimmed) return null;
    if (!/^[\d.+*\-/]+$/.test(trimmed)) return null;
    try {
        const result = Function('"use strict"; return (' + trimmed + ')')();
        return typeof result === 'number' && Number.isFinite(result) ? result : null;
    } catch {
        return null;
    }
}

function formatCalcNumber(n: number): string {
    if (!Number.isFinite(n)) return ' ';
    const rounded = Math.abs(n - Math.round(n)) < 1e-10 ? Math.round(n) : Number(n.toFixed(10));
    return String(rounded).replace('.', ',');
}

function liveValue(expr: string): number | null {
    const evalStr = toEvalExpr(expr).replace(/\s/g, '');
    if (!evalStr) return null;
    const ready = evalStr.replace(/[+\-*/.]+$/, '');
    if (!ready) return null;
    return safeEval(ready);
}

function lastNumberSpan(expr: string): { start: number; value: string } | null {
    const match = expr.match(/([0-9]+(?:,[0-9]*)?)$/);
    if (!match || match.index == null) return null;
    return { start: match.index, value: match[1] };
}

type KeyTone = 'num' | 'fn' | 'op';

const KEYPAD: { key: string; label: ReactNode; tone: KeyTone }[][] = [
    [
        { key: '7', label: '7', tone: 'num' },
        { key: '8', label: '8', tone: 'num' },
        { key: '9', label: '9', tone: 'num' },
        { key: 'back', label: <Delete size={18} strokeWidth={2.4} />, tone: 'fn' },
        { key: '÷', label: '÷', tone: 'op' },
    ],
    [
        { key: '4', label: '4', tone: 'num' },
        { key: '5', label: '5', tone: 'num' },
        { key: '6', label: '6', tone: 'num' },
        { key: 'AC', label: 'AC', tone: 'fn' },
        { key: '×', label: '×', tone: 'op' },
    ],
    [
        { key: '1', label: '1', tone: 'num' },
        { key: '2', label: '2', tone: 'num' },
        { key: '3', label: '3', tone: 'num' },
        { key: '%', label: '%', tone: 'fn' },
        { key: '-', label: '−', tone: 'op' },
    ],
    [
        { key: '±', label: '⁺⁄₋', tone: 'num' },
        { key: '0', label: '0', tone: 'num' },
        { key: ',', label: ',', tone: 'num' },
        { key: '=', label: '=', tone: 'op' },
        { key: '+', label: '+', tone: 'op' },
    ],
];

const OPS = new Set(['+', '-', '×', '÷']);

function IosCalcKey({
    tone,
    children,
    onClick,
    ariaLabel,
}: {
    tone: KeyTone;
    children: ReactNode;
    onClick: () => void;
    ariaLabel: string;
}) {
    return (
        <button
            type="button"
            aria-label={ariaLabel}
            onClick={onClick}
            className={cn(
                'flex h-full min-h-12 min-w-12 w-full items-center justify-center rounded-full text-[22px] font-medium tabular-nums transition-transform active:scale-95',
                tone === 'num' && 'text-white',
                tone === 'fn' && 'text-[#1c1c1e] text-[17px] font-semibold',
                tone === 'op' && 'text-white text-[26px]',
            )}
            style={{
                background:
                    tone === 'num' ? CALC.num : tone === 'fn' ? CALC.fn : CALC.op,
            }}
        >
            {children}
        </button>
    );
}

function IosCalculator({ onCopyValue }: { onCopyValue: (value: string) => void }) {
    const [expr, setExpr] = useState('');
    const [justEvaluated, setJustEvaluated] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [history, setHistory] = useState<HistoryEntry[]>([]);

    const result = liveValue(expr);
    const resultLabel = result == null ? (expr ? ' ' : '0') : formatCalcNumber(result);

    const handleKey = useCallback((key: string) => {
        if (key === 'AC') {
            setExpr('');
            setJustEvaluated(false);
            return;
        }
        if (key === 'back') {
            setJustEvaluated(false);
            setExpr((prev) => prev.slice(0, -1));
            return;
        }
        if (key === '=') {
            const val = liveValue(expr);
            if (val == null || !expr) return;
            const shown = formatCalcNumber(val);
            setHistory((prev) => [{ expression: expr, result: shown }, ...prev].slice(0, 40));
            setExpr(shown);
            setJustEvaluated(true);
            return;
        }
        if (key === '±') {
            setJustEvaluated(false);
            setExpr((prev) => {
                const span = lastNumberSpan(prev);
                if (!span) return prev.startsWith('−') ? prev.slice(1) : prev ? `−${prev}` : prev;
                const before = prev.slice(0, span.start);
                if (before.endsWith('−')) return `${before.slice(0, -1)}${span.value}`;
                return `${before}−${span.value}`;
            });
            return;
        }
        if (key === '%') {
            setJustEvaluated(false);
            setExpr((prev) => {
                const span = lastNumberSpan(prev);
                if (!span) return prev;
                const n = Number(span.value.replace(',', '.'));
                if (!Number.isFinite(n)) return prev;
                return `${prev.slice(0, span.start)}${formatCalcNumber(n / 100)}`;
            });
            return;
        }
        if (key === ',') {
            const startFresh = justEvaluated;
            setJustEvaluated(false);
            setExpr((prev) => {
                if (startFresh) return '0,';
                const span = lastNumberSpan(prev);
                if (span?.value.includes(',')) return prev;
                if (!span) return `${prev}0,`;
                return `${prev},`;
            });
            return;
        }
        if (OPS.has(key)) {
            const op = key === '-' ? '−' : key;
            setJustEvaluated(false);
            setExpr((prev) => {
                if (!prev) return op === '−' ? '−' : prev;
                const last = prev.slice(-1);
                if (OPS.has(last) || last === '−') return `${prev.slice(0, -1)}${op}`;
                return `${prev}${op}`;
            });
            return;
        }
        const startFresh = justEvaluated;
        setJustEvaluated(false);
        setExpr((prev) => (startFresh ? key : `${prev}${key}`));
    }, [expr, justEvaluated]);

    const copyTarget = resultLabel === ' ' ? '0' : resultLabel;

    return (
        <div className="flex flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            <div className="flex items-end gap-2">
                <div className="flex shrink-0 items-center gap-0.5">
                    <button
                        type="button"
                        aria-label={historyOpen ? 'Mostrar teclado' : 'Mostrar historial'}
                        aria-pressed={historyOpen}
                        onClick={() => setHistoryOpen((v) => !v)}
                        className={cn(
                            'flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-full',
                            historyOpen ? 'text-white' : 'text-[#8e8e93]',
                        )}
                    >
                        <Clock size={22} strokeWidth={2.2} />
                    </button>
                    <button
                        type="button"
                        aria-label="Copiar valor"
                        onClick={() => onCopyValue(copyTarget)}
                        className="flex h-12 w-12 min-h-12 min-w-12 items-center justify-center rounded-full text-[#8e8e93]"
                    >
                        <Copy size={20} strokeWidth={2.2} />
                    </button>
                </div>
                <div className="min-w-0 flex-1 text-right">
                    <div className="truncate text-[13px] font-medium tabular-nums text-[#8e8e93]">
                        {expr || ' '}
                    </div>
                    <div className="truncate text-[44px] font-light leading-none tabular-nums tracking-tight text-white">
                        {resultLabel}
                    </div>
                </div>
            </div>

            <div className="h-[min(18.5rem,46dvh)] min-h-[16rem]">
                {historyOpen ? (
                    <div className="flex h-full flex-col overflow-y-auto px-1">
                        {history.map((entry, i) => (
                            <button
                                key={`${entry.expression}-${i}`}
                                type="button"
                                className="flex min-h-12 w-full shrink-0 items-baseline justify-between gap-3 border-0 border-b border-white/10 bg-transparent px-1 py-2 text-left"
                                onClick={() => {
                                    setExpr(entry.result);
                                    setJustEvaluated(true);
                                    setHistoryOpen(false);
                                }}
                            >
                                <span className="min-w-0 truncate text-[13px] text-[#8e8e93]">{entry.expression}</span>
                                <span className="shrink-0 text-[18px] font-medium tabular-nums text-white">{entry.result}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="grid h-full grid-cols-5 grid-rows-4 gap-2">
                        {KEYPAD.flat().map((cell, i) => (
                            <div key={`${cell.key}-${i}`} className="flex min-h-12 min-w-12 items-center justify-center">
                                <div className="aspect-square h-full max-w-full">
                                    <IosCalcKey
                                        tone={cell.tone}
                                        ariaLabel={cell.key === 'back' ? 'Borrar' : cell.key === 'AC' ? 'Borrar todo' : String(cell.key)}
                                        onClick={() => handleKey(cell.key)}
                                    >
                                        {cell.label}
                                    </IosCalcKey>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function BreakdownDraft() {
    const [counts, setCounts] = useState<Record<number, number>>({});
    const total = DENOMINATIONS.reduce((sum, d) => sum + d * (counts[d] || 0), 0);

    return (
        <div className="flex max-h-[min(55dvh,28rem)] min-h-0 flex-col bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2">
                <DenominationCountGrid
                    counts={counts}
                    onAdjust={(denom, delta) => {
                        setCounts((prev) => ({
                            ...prev,
                            [denom]: Math.max(0, (prev[denom] || 0) + delta),
                        }));
                    }}
                    onChange={(denom, raw) => {
                        const num = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                        setCounts((prev) => ({ ...prev, [denom]: num }));
                    }}
                />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Total</span>
                <span className="text-lg font-black tabular-nums text-zinc-800">
                    {total > 0.005 ? formatCurrencySpanish(total) : ' '}
                </span>
            </div>
        </div>
    );
}

export function QuickCalculatorModal({
    isOpen,
    onClose,
    overlayClassName,
    tab = 'calculator',
    allowCalculator = true,
    allowBreakdown = true,
}: {
    isOpen: boolean;
    onClose: () => void;
    overlayClassName?: string;
    tab?: QuickCashTool;
    onTabChange?: (tab: QuickCashTool) => void;
    allowCalculator?: boolean;
    allowBreakdown?: boolean;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const resolvedTab: QuickCashTool = !allowCalculator
        ? 'breakdown'
        : !allowBreakdown
            ? 'calculator'
            : tab;

    useModalUsageTracking({
        open: isOpen,
        usageId: resolvedTab === 'breakdown' ? 'quick-breakdown' : 'quick-calculator',
        usageLabel: resolvedTab === 'breakdown' ? 'Desglose de borrador' : 'Calculadora rápida',
    });

    useLayoutEffect(() => {
        if (!isOpen) {
            clearToolInset();
            return;
        }
        const el = panelRef.current;
        if (!el) return;
        const sync = () => applyToolInset(el.getBoundingClientRect().height);
        sync();
        const observer = new ResizeObserver(sync);
        observer.observe(el);
        return () => {
            observer.disconnect();
            clearToolInset();
        };
    }, [isOpen, resolvedTab, mounted]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [isOpen, onClose]);

    const handleCopy = useCallback((value: string) => {
        navigator.clipboard.writeText(value).then(() => {
            toast.success('Valor copiado');
        }).catch(() => {
            toast.error('No se pudo copiar');
        });
    }, []);

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div
            ref={panelRef}
            data-component="QuickCashToolsPanel"
            data-tab={resolvedTab}
            className={cn(
                'fixed inset-x-0 bottom-0 z-[var(--z-modal-sheet)] select-none',
                overlayClassName,
            )}
            style={{ background: resolvedTab === 'calculator' ? CALC.bg : '#ffffff' }}
        >
            {resolvedTab === 'calculator' && allowCalculator ? (
                <IosCalculator onCopyValue={handleCopy} />
            ) : null}
            {resolvedTab === 'breakdown' && allowBreakdown ? (
                <BreakdownDraft />
            ) : null}
        </div>,
        document.body,
    );
}

function ToolFab({
    src,
    ariaLabel,
    onClick,
    pressed,
}: {
    src: string;
    ariaLabel: string;
    onClick: () => void;
    pressed?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            aria-pressed={pressed}
            className="h-14 w-14 min-h-[56px] min-w-[56px] shrink-0 overflow-hidden rounded-[var(--radio-superficie)] border-0 bg-transparent p-0 shadow-2xl shadow-black/25 transition-all hover:brightness-110 active:scale-95"
        >
            <img src={src} alt="" draggable={false} className="pointer-events-none h-full w-full object-cover" />
        </button>
    );
}

export function QuickCashToolsFabs({
    calculator,
    breakdown,
    isOpen,
    openTab,
    onOpen,
    className,
}: {
    calculator: boolean;
    breakdown: boolean;
    isOpen: boolean;
    openTab?: QuickCashTool | null;
    onOpen: (tab: QuickCashTool) => void;
    className?: string;
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);
    if (!calculator && !breakdown) return null;
    if (!mounted) return null;
    return createPortal(
        <div
            className={cn(
                'fixed right-4 z-[208] flex shrink-0 flex-col-reverse items-center gap-3 sm:right-6',
                isOpen
                    ? 'bottom-[calc(var(--quick-tool-inset,0px)+0.75rem)]'
                    : 'bottom-4 sm:bottom-6',
                className,
            )}
        >
            {calculator ? (
                <ToolFab
                    src={CALCULATOR_ICON}
                    ariaLabel={openTab === 'calculator' ? 'Cerrar calculadora' : 'Abrir calculadora'}
                    pressed={openTab === 'calculator'}
                    onClick={() => onOpen('calculator')}
                />
            ) : null}
            {breakdown ? (
                <ToolFab
                    src={BREAKDOWN_ICON}
                    ariaLabel={openTab === 'breakdown' ? 'Cerrar desglose' : 'Abrir desglose'}
                    pressed={openTab === 'breakdown'}
                    onClick={() => onOpen('breakdown')}
                />
            ) : null}
        </div>,
        document.body,
    );
}

/**
 * Acceso flotante a calculadora y/o desglose de borrador.
 * Cada superficie declara qué botones monta.
 */
export function QuickCashTools({
    calculator = false,
    breakdown = false,
    overlayClassName,
    className,
    open,
    onOpenChange,
}: {
    calculator?: boolean;
    breakdown?: boolean;
    overlayClassName?: string;
    className?: string;
    open?: QuickCashTool | null;
    onOpenChange?: (next: QuickCashTool | null) => void;
}) {
    const [internalOpen, setInternalOpen] = useState<QuickCashTool | null>(null);
    const isControlled = open !== undefined;
    const openTab = isControlled ? open : internalOpen;
    const setOpenTab = (next: QuickCashTool | null) => {
        if (!isControlled) setInternalOpen(next);
        onOpenChange?.(next);
    };

    if (!calculator && !breakdown) return null;

    const resolvedTab: QuickCashTool = openTab
        ?? (calculator ? 'calculator' : 'breakdown');

    return (
        <>
            <QuickCalculatorModal
                isOpen={openTab !== null}
                onClose={() => setOpenTab(null)}
                overlayClassName={overlayClassName}
                tab={resolvedTab}
                allowCalculator={calculator}
                allowBreakdown={breakdown}
            />
            <QuickCashToolsFabs
                calculator={calculator}
                breakdown={breakdown}
                isOpen={openTab !== null}
                openTab={openTab}
                onOpen={(tab) => setOpenTab(openTab === tab ? null : tab)}
                className={className}
            />
        </>
    );
}

/** Botón discreto para cabecera de modal: abre la calculadora. */
export function CalculatorHeaderButton({
    onToggle,
    className,
    ariaLabel = 'Abrir calculadora',
}: {
    isOpen?: boolean;
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
                'flex h-12 w-12 min-h-[48px] min-w-[48px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radio-superficie)]',
                'border-0 bg-transparent p-0 transition-all hover:brightness-110 active:scale-95',
                className,
            )}
        >
            <img src={CALCULATOR_ICON} alt="" draggable={false} className="pointer-events-none h-9 w-9 object-cover" />
        </button>
    );
}
