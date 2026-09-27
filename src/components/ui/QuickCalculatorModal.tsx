'use client';

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Clock, Copy, Delete, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DENOMINATIONS } from '@/lib/constants';
import { DenominationCountGrid } from '@/components/cash/DenominationCountGrid';
import { formatCurrencySpanish } from '@/lib/cash-closing-metrics';
import {
    readBreakdownDraft,
    writeBreakdownDraft,
    type BreakdownCounts,
} from '@/lib/quick-breakdown-draft';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { Button } from '@/components/ui/button';
import {
    INITIAL_CALC,
    loadCalcResult,
    pressCalcKey,
    type CalcOp,
    type CalcState,
} from '@/lib/quick-calculator';

export type QuickCashTool = 'calculator' | 'breakdown';

const CALCULATOR_ICON = '/icons/calculadora.png';
const INSET_VAR = '--quick-tool-inset';
const FAB_DOCK_VAR = '--quick-fab-dock';
const TOOLS_ROW_VAR = '--quick-tools-row';
/** Aire entre el canto inferior del modal y la fila de herramientas. */
const TOOLS_ROW_GAP = 8;

/** Alto común del panel (calculadora y desglose), sin el área segura. */
const QUICK_PANEL_H = 'h-[16.625rem]';

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

function clearFabDock() {
    const root = document.documentElement;
    root.style.setProperty(FAB_DOCK_VAR, '0px');
    root.removeAttribute('data-quick-fab');
}

function applyToolsRow(px: number) {
    const next = `${Math.max(0, Math.round(px))}px`;
    const root = document.documentElement;
    if (root.style.getPropertyValue(TOOLS_ROW_VAR) === next) return;
    root.style.setProperty(TOOLS_ROW_VAR, next);
}

function clearToolsRow() {
    document.documentElement.style.setProperty(TOOLS_ROW_VAR, '0px');
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

function MinimizeHandle({
    onMinimize,
    tone,
}: {
    onMinimize: () => void;
    tone: 'dark' | 'light';
}) {
    return (
        <button
            type="button"
            aria-label="Minimizar"
            onClick={onMinimize}
            className={cn(
                'flex h-12 w-12 min-h-12 min-w-12 items-center justify-center border-0 bg-transparent p-0',
                tone === 'dark' ? 'text-[#8e8e93]' : 'text-zinc-400',
            )}
        >
            <ChevronDown size={18} strokeWidth={1.75} />
        </button>
    );
}

function IosCalcKey({
    tone,
    children,
    onClick,
    ariaLabel,
    active = false,
}: {
    tone: KeyTone;
    children: ReactNode;
    onClick: () => void;
    ariaLabel: string;
    /** Operador pendiente, como en iOS: fondo blanco y glifo naranja. */
    active?: boolean;
}) {
    return (
        <button
            type="button"
            aria-label={ariaLabel}
            aria-pressed={active || undefined}
            onClick={onClick}
            className={cn(
                'flex h-12 min-h-12 w-full min-w-0 items-center justify-center rounded-full text-[20px] font-medium tabular-nums transition-transform active:scale-95',
                tone === 'num' && 'text-white',
                tone === 'fn' && 'text-[#1c1c1e] text-[16px] font-semibold',
                tone === 'op' && !active && 'text-white text-[22px]',
                tone === 'op' && active && 'text-[22px]',
            )}
            style={{
                background: active
                    ? '#ffffff'
                    : tone === 'num'
                        ? CALC.num
                        : tone === 'fn'
                            ? CALC.fn
                            : CALC.op,
                color: active ? CALC.op : undefined,
            }}
        >
            {children}
        </button>
    );
}

function pendingOpMatches(key: string, op: CalcOp | null): boolean {
    if (!op) return false;
    if (op === '−') return key === '-' || key === '−';
    return key === op;
}

function IosCalculator({
    onCopyValue,
    onMinimize,
}: {
    onCopyValue: (value: string) => void;
    onMinimize: () => void;
}) {
    const [calc, setCalc] = useState<CalcState>(INITIAL_CALC);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [history, setHistory] = useState<HistoryEntry[]>([]);

    const calcRef = useRef(calc);
    calcRef.current = calc;

    const handleKey = useCallback((key: string) => {
        const next = pressCalcKey(calcRef.current, key);
        calcRef.current = next.state;
        if (next.committed) {
            const entry = next.committed;
            setHistory((items) => [entry, ...items].slice(0, 40));
        }
        setCalc(next.state);
    }, []);

    const copyTarget = calc.error ? '0' : calc.display;

    return (
        <div className="pb-[env(safe-area-inset-bottom,0px)]">
        <div className={cn('flex flex-col gap-1.5 px-2 pt-0.5', QUICK_PANEL_H)}>
            <div className="relative flex items-end gap-2">
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
                <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
                    <div className="pointer-events-auto">
                        <MinimizeHandle onMinimize={onMinimize} tone="dark" />
                    </div>
                </div>
                <div className="min-w-0 flex-1 text-right">
                    <div className="truncate text-[32px] font-light leading-none tabular-nums tracking-tight text-white">
                        {calc.display}
                    </div>
                </div>
            </div>

            <div className="h-[13.125rem]">
                {historyOpen ? (
                    <div className="flex h-full flex-col overflow-y-auto px-1">
                        {history.map((entry, i) => (
                            <button
                                key={`${entry.expression}-${i}`}
                                type="button"
                                className="flex min-h-12 w-full shrink-0 items-baseline justify-between gap-3 border-0 border-b border-white/10 bg-transparent px-1 py-2 text-left"
                                onClick={() => {
                                    setCalc(loadCalcResult(entry.result));
                                    setHistoryOpen(false);
                                }}
                            >
                                <span className="min-w-0 truncate text-[13px] text-[#8e8e93]">{entry.expression}</span>
                                <span className="shrink-0 text-[18px] font-medium tabular-nums text-white">{entry.result}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="grid h-full grid-cols-5 grid-rows-4 gap-1.5">
                        {KEYPAD.flat().map((cell, i) => (
                            <IosCalcKey
                                key={`${cell.key}-${i}`}
                                tone={cell.tone}
                                active={calc.waiting && pendingOpMatches(cell.key, calc.pendingOp)}
                                ariaLabel={cell.key === 'back' ? 'Borrar' : cell.key === 'AC' ? 'Borrar todo' : String(cell.key)}
                                onClick={() => handleKey(cell.key)}
                            >
                                {cell.label}
                            </IosCalcKey>
                        ))}
                    </div>
                )}
            </div>
        </div>
        </div>
    );
}

function BreakdownDraft({ onMinimize }: { onMinimize: () => void }) {
    const [counts, setCounts] = useState<BreakdownCounts>(() => readBreakdownDraft(DENOMINATIONS));
    const countsRef = useRef(counts);
    countsRef.current = counts;
    const total = DENOMINATIONS.reduce((sum, d) => sum + d * (counts[d] || 0), 0);

    const commit = (next: BreakdownCounts) => {
        countsRef.current = next;
        setCounts(next);
        writeBreakdownDraft(next, DENOMINATIONS);
    };

    return (
        <div className="bg-white pb-[env(safe-area-inset-bottom,0px)]">
        <div className={cn('flex min-h-0 flex-col', QUICK_PANEL_H)}>
            <div className="flex shrink-0 justify-center">
                <MinimizeHandle onMinimize={onMinimize} tone="light" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-1.5">
                <DenominationCountGrid
                    compact
                    counts={counts}
                    onAdjust={(denom, delta) => {
                        const prev = countsRef.current;
                        const qty = Math.max(0, (prev[denom] || 0) + delta);
                        const next = { ...prev };
                        if (qty === 0) delete next[denom];
                        else next[denom] = qty;
                        commit(next);
                    }}
                    onChange={(denom, raw) => {
                        const qty = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                        const next = { ...countsRef.current };
                        if (qty === 0) delete next[denom];
                        else next[denom] = qty;
                        commit(next);
                    }}
                    trailing={
                        <>
                            <div className="flex min-w-0 flex-col items-center justify-center gap-0.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                    Total
                                </span>
                                <span className="max-w-full truncate text-center text-[12px] font-black tabular-nums leading-none text-zinc-800">
                                    {total > 0.005 ? formatCurrencySpanish(total) : ' '}
                                </span>
                            </div>
                            <div className="flex min-w-0 items-center justify-center">
                                <Button
                                    type="button"
                                    variant="primary"
                                    layout="fill"
                                    instance="quick-breakdown-new"
                                    onClick={() => commit({})}
                                >
                                    Nuevo
                                </Button>
                            </div>
                        </>
                    }
                />
            </div>
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
                'fixed inset-x-0 z-[var(--z-modal-sheet)] select-none',
                overlayClassName,
            )}
            style={{
                background: resolvedTab === 'calculator' ? CALC.bg : '#ffffff',
                bottom: 0,
            }}
        >
            {resolvedTab === 'calculator' && allowCalculator ? (
                <IosCalculator onCopyValue={handleCopy} onMinimize={onClose} />
            ) : null}
            {resolvedTab === 'breakdown' && allowBreakdown ? (
                <BreakdownDraft onMinimize={onClose} />
            ) : null}
        </div>,
        document.body,
    );
}

type ToolsRowBox = { top: number; left: number; width: number };

/**
 * Fila de acceso a calculadora y desglose, fuera del modal y debajo de él.
 * Desglose a la izquierda (botón secundario) y calculadora a la derecha
 * (botón primario). No entra en el ancho del modal. Al abrir el panel, se retira.
 */
export function QuickCashToolsFabs({
    calculator,
    breakdown,
    isOpen,
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
    const dockRef = useRef<HTMLDivElement>(null);
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [mounted, setMounted] = useState(false);
    const [box, setBox] = useState<ToolsRowBox | null>(null);
    const [placed, setPlaced] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useLayoutEffect(() => {
        if (!mounted) return;
        clearFabDock();
        if (isOpen) {
            clearToolsRow();
            return;
        }
        const sync = () => {
            const modal = anchorRef.current?.closest('[data-component="Modal"]');
            const container = modal?.querySelector('[data-element="container"]');
            const dock = dockRef.current;
            if (!(container instanceof HTMLElement) || !dock) {
                setBox(null);
                setPlaced(true);
                clearToolsRow();
                return;
            }
            const rect = container.getBoundingClientRect();
            const next = {
                top: Math.round(rect.bottom + TOOLS_ROW_GAP),
                left: Math.round(rect.left),
                width: Math.round(rect.width),
            };
            setBox((prev) =>
                prev && prev.top === next.top && prev.left === next.left && prev.width === next.width
                    ? prev
                    : next,
            );
            applyToolsRow(dock.getBoundingClientRect().height + TOOLS_ROW_GAP);
            setPlaced(true);
        };
        sync();
        const modal = anchorRef.current?.closest('[data-component="Modal"]');
        const container = modal?.querySelector('[data-element="container"]');
        const observer = new ResizeObserver(sync);
        if (container instanceof HTMLElement) observer.observe(container);
        if (dockRef.current) observer.observe(dockRef.current);
        window.addEventListener('resize', sync);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', sync);
            clearFabDock();
            clearToolsRow();
        };
    }, [mounted, calculator, breakdown, isOpen]);

    if (!calculator && !breakdown) return null;
    if (!mounted || isOpen) return null;

    const onModal = box != null;

    return (
        <>
            <span
                ref={anchorRef}
                data-element="quick-fab-anchor"
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden"
            />
            {createPortal(
                <div
                    ref={dockRef}
                    data-component="QuickCashToolsFabs"
                    data-overlay={onModal ? 'modal' : undefined}
                    className={cn(className, 'pointer-events-none fixed z-[208]')}
                    style={
                        onModal
                            ? {
                                  top: `${box.top}px`,
                                  left: `${box.left}px`,
                                  width: `${box.width}px`,
                                  right: 'auto',
                                  bottom: 'auto',
                                  visibility: placed ? undefined : 'hidden',
                              }
                            : { visibility: placed ? undefined : 'hidden' }
                    }
                >
                    <div
                        data-element="dock"
                        role="group"
                        aria-label="Herramientas de recuento"
                        className={cn(
                            'pointer-events-auto flex w-full items-center gap-2',
                            calculator && !breakdown ? 'justify-end' : 'justify-between',
                        )}
                    >
                        {breakdown ? (
                            <Button
                                type="button"
                                variant="secondary"
                                instance="quick-tools-breakdown"
                                onClick={() => onOpen('breakdown')}
                            >
                                Desglose
                            </Button>
                        ) : null}
                        {calculator ? (
                            <Button
                                type="button"
                                variant="primary"
                                instance="quick-tools-calculator"
                                onClick={() => onOpen('calculator')}
                            >
                                Calculadora
                            </Button>
                        ) : null}
                    </div>
                </div>,
                document.body,
            )}
        </>
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
            <img src={CALCULATOR_ICON} alt="" draggable={false} className="pointer-events-none h-9 w-9 object-contain" />
        </button>
    );
}
