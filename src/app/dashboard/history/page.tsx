'use client'; // Force update v3 - polishing calendar cards

import { useEffect, useState, useMemo, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    CloudSun,
    Receipt,
    ChevronLeft,
    ChevronRight,
    X,
    Pencil,
    Trash2,
    ChevronRight as ChevronRightIcon,
    Banknote,
    Share,
} from 'lucide-react';
import Image from 'next/image';
import { ImageLightbox, type ImageLightboxSlide } from '@/components/ui/ImageLightbox';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, startOfMonth, endOfMonth, isSameDay, addDays, subMonths, isSameMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, isToday, isBefore, startOfDay, subWeeks, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import CashClosingModal from '@/components/CashClosingModal';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { PeriodNav, PeriodFilterButton } from '@/components/time/PeriodNav';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import { MonthPickerGrid } from '@/components/time/MonthPickerGrid';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import { Button } from '@/components/ui/button';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { TABLE_COMPONENT_ID } from '@/lib/design-system';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import * as XLSX from 'xlsx';
import { downloadWorkbook, printHtml } from '@/lib/export/browser-output';
import { deleteCashClosingPhotosAction, getCashClosingPhotoUrlsAction } from '@/app/actions/cash-closing-photos';
import { CLOSING_WEATHER_OPTIONS, weatherIdFromLabel } from '@/lib/cash-closing-weather';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';
import { DenominationCountGrid } from '@/components/cash/DenominationCountGrid';
import { CashCountFooter } from '@/components/cash/CashCountFooter';

// --- TYPES & CONSTANTS ---
type MetricType = 'net_sales' | 'tpv_sales' | 'avg_ticket' | 'tickets_count' | 'cash_counted';

interface RendimientoScale {
    level: 1 | 2 | 3 | 4 | 5;
    icon: 'up' | 'right' | 'down';
    color: string;
    label: string;
}

function TrendTriangle({ type, className, size = 'md' }: { type: 'up' | 'down' | 'right'; className?: string; size?: 'sm' | 'md' }) {
    const s = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
    if (type === 'up') {
        return (
            <svg className={cn("fill-current inline-block shrink-0 align-middle", s, className)} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4l9 15H3z" />
            </svg>
        );
    }
    if (type === 'down') {
        return (
            <svg className={cn("fill-current inline-block shrink-0 align-middle", s, className)} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 20L3 5h18z" />
            </svg>
        );
    }
    return null;
}

function formatCurrencySpanish(val: number): string {
    const isWhole = Math.abs(val - Math.round(val)) < 0.005;
    const formatted = val.toLocaleString('es-ES', {
        minimumFractionDigits: isWhole ? 0 : 2,
        maximumFractionDigits: 2
    });
    return `${formatted}€`;
}

type MonthKey = string;

function toMonthKey(date: Date): MonthKey {
    return format(date, 'yyyy-MM');
}

function monthKeyLabel(key: MonthKey): string {
    const [y, m] = key.split('-').map(Number);
    return format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: es });
}

function monthKeyToRange(key: MonthKey): { start: string; end: string } {
    const [y, m] = key.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    return {
        start: format(start, 'yyyy-MM-dd'),
        end: format(endOfMonth(start), 'yyyy-MM-dd'),
    };
}

type ClosingExportRow = {
    fecha: string;
    ventas: string;
    neta: string;
    ticks: string;
    tm: string;
    cash: string;
    card: string;
    pend: string;
    recup: string;
    dif: string;
};

const EXPORT_TABLE_HEADERS = [
    'Fecha', 'Ventas €', 'Neta €', 'Ticks', 'TM €', 'Cash €', 'Card €', 'Pend. €', 'Recup. €', 'Dif. €',
] as const;

function buildClosingExportRows(closings: any[]): ClosingExportRow[] {
    return [...closings]
        // Ordenar por closing_date (siempre presente) en lugar de closed_at (puede ser null)
        .sort((a, b) => (b.closing_date ?? '').localeCompare(a.closing_date ?? ''))
        .map((c) => {
            // Usar closing_date (campo local YYYY-MM-DD) para la fecha del export;
            // closed_at puede ser null en registros antiguos y causaría Invalid Date.
            const d = parseLocalSafe(c.closing_date);
            const avgTicket = (c.tickets_count || 0) > 0 ? (c.tpv_sales || 0) / c.tickets_count : 0;
            const diff = c.difference ?? 0;
            const fmtCur = (val: number) => (val === 0 ? '' : formatCurrencySpanish(val));
            return {
                fecha: format(d, 'd/M/yy', { locale: es }),
                ventas: fmtCur(c.tpv_sales || 0),
                neta: fmtCur(c.net_sales || 0),
                ticks: (c.tickets_count || 0).toLocaleString('es-ES'),
                tm: avgTicket === 0 ? '' : formatCurrencySpanish(avgTicket),
                cash: fmtCur(c.cash_counted || 0),
                card: fmtCur(c.sales_card || 0),
                pend: fmtCur(c.sales_pending || 0),
                recup: fmtCur(c.debt_recovered || 0),
                dif: diff === 0 ? '' : formatCurrencySpanish(diff),
            };
        });
}

function buildExportTableHtml(rows: ClosingExportRow[], title: string): string {
    const headerHtml = EXPORT_TABLE_HEADERS.map((h) => `<th>${h}</th>`).join('');
    const bodyHtml = rows
        .map((row) => {
            const cells = [row.fecha, row.ventas, row.neta, row.ticks, row.tm, row.cash, row.card, row.pend, row.recup, row.dif];
            return `<tr>${cells.map((cell, i) => `<td${i === 0 ? '' : ' style="text-align:right"'}>${cell || ' '}</td>`).join('')}</tr>`;
        })
        .join('');
    return `<h1 style="font-size:18px;margin-bottom:12px;font-weight:800;">${title}</h1><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

async function exportClosingsToExcel(closings: any[], monthKeys: string[]) {
    const rows = buildClosingExportRows(closings);
    const aoa = [
        [...EXPORT_TABLE_HEADERS],
        ...rows.map((r) => [r.fecha, r.ventas, r.neta, r.ticks, r.tm, r.cash, r.card, r.pend, r.recup, r.dif]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cierres');

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    const monthStamp = monthKeys.length === 1 ? monthKeys[0] : `${monthKeys[0]}_${monthKeys[monthKeys.length - 1]}`;
    const fileName = `cierres_${monthStamp}_${stamp}.xlsx`;
    downloadWorkbook(wb, fileName);
}

function printClosingsTable(closings: any[], title: string) {
    const rows = buildClosingExportRows(closings);
    printHtml(buildExportTableHtml(rows, title), {
        pageSize: 'landscape',
        extraCss: 'thead th, tbody td { text-align: right; } thead th:first-child, tbody td:first-child { text-align: left; }',
    });
}

function formatCurrencyModal(val: number): string {
    if (Math.abs(val) < 0.005) return '';
    const formatted = val.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return `${formatted}€`;
}

function formatCurrencyCalendar(val: number): string {
    const rounded = Math.round(val);
    return `${rounded.toLocaleString('es-ES')}€`;
}

function getRendimientoScale(diffPercent: number): RendimientoScale {
    if (diffPercent > 15) {
        return { level: 5, icon: 'up', color: 'text-emerald-600', label: 'Excelente' };
    }
    if (diffPercent >= 5) {
        return { level: 4, icon: 'up', color: 'text-emerald-500', label: 'Bueno' };
    }
    if (diffPercent >= -5) {
        return { level: 3, icon: 'right', color: 'text-zinc-400', label: 'Esperado' };
    }
    if (diffPercent >= -15) {
        return { level: 2, icon: 'down', color: 'text-orange-500', label: 'Bajo' };
    }
    return { level: 1, icon: 'down', color: 'text-rose-600', label: 'Crítico' };
}

function ClosingCalendarCellContent({
    closing,
    expectedSales,
}: {
    closing: any;
    expectedSales: number;
}) {
    const netSales = Number(closing.net_sales ?? 0);
    const rounded = Math.round(netSales);
    
    const diffPercent = expectedSales > 0 && netSales > 0 
        ? ((netSales - expectedSales) / expectedSales) * 100 
        : 0;

    const hasExpected = expectedSales > 0 && netSales > 0;
    const scale = getRendimientoScale(hasExpected ? diffPercent : 0);

    const roundedDiff = Math.round(diffPercent);
    const displayPercent = (roundedDiff >= 0 ? '+' : '') + roundedDiff + '%';

    return (
        <div className="flex flex-col items-center justify-center gap-0.5 w-full text-center flex-1 h-full">
            {rounded > 0 ? (
                <>
                    <div className="text-[10px] sm:text-xs md:text-sm font-extrabold leading-none tabular-nums text-zinc-950">
                        {formatCurrencyCalendar(netSales)}
                    </div>
                    {hasExpected && (
                        <div className="flex items-center justify-center gap-[1px] mt-0.5 leading-none">
                            <TrendTriangle type={scale.icon} className={scale.color} size="sm" />
                            <span className={cn("text-[7.5px] md:text-[8px] font-black tracking-wider leading-none", scale.color)}>
                                {Math.abs(Math.round(diffPercent))}%
                            </span>
                        </div>
                    )}
                </>
            ) : (
                <span className="text-transparent"> </span>
            )}
        </div>
    );
}

function ClosingCalendarDayLabel({
    day,
    today,
    isViewMonthDay,
}: {
    day: Date;
    today: boolean;
    isViewMonthDay: boolean;
}) {
    return (
        <div className="absolute top-1 right-1 flex items-center justify-end leading-none z-10">
            <span
                className={cn(
                    'text-[8px] md:text-[9px] font-medium',
                    today && isViewMonthDay ? 'text-blue-600 bg-blue-50/80 px-1 py-0.5 rounded-md font-semibold' : 'text-gray-400',
                    !isViewMonthDay && 'opacity-50'
                )}
            >
                {format(day, 'd')}
            </span>
        </div>
    );
}

// --- MINI COMPONENTS ---

const Sparkline = ({ data, color = "#10b981", height = 40, width = 120 }: { data: number[], color?: string, height?: number, width?: number }) => {
    if (!data.length) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => ({
        x: (i / (data.length - 1)) * width,
        y: height - ((v - min) / range) * height
    }));

    const pathData = points.reduce((acc, p, i) =>
        acc + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), ""
    );

    return (
        <svg width={width} height={height} className="overflow-visible">
            <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-sm"
            />
        </svg>
    );
};

const DonutChart = ({ size = 60, percentage = 75, color = "#10b981" }: { size?: number, percentage?: number, color?: string }) => {
    const radius = size / 2.5;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="currentColor"
                strokeWidth="6"
                fill="transparent"
                className="text-gray-100"
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={color}
                strokeWidth="6"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
            />
        </svg>
    );
};

const CashBreakdownModal = ({
    isOpen,
    onClose,
    breakdown,
    date,
    total,
    isEditing = false,
    onUpdate,
    onSave,
    saving = false,
}: {
    isOpen: boolean,
    onClose: () => void,
    breakdown: any,
    date: string,
    total: number,
    isEditing?: boolean,
    onUpdate?: (den: string, qty: number) => void,
    onSave?: () => void,
    saving?: boolean,
}) => {
    const [calculatorOpen, setCalculatorOpen] = useState(false);

    const displayBreakdown = isEditing ? {
        ...DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.toString()]: 0 }), {} as Record<string, number>),
        ...breakdown
    } : breakdown;

    const titleDate = (() => {
        const d = new Date(date);
        return isNaN(d.getTime()) ? "Fecha Inválida" : format(d, 'eeee d MMM', { locale: es });
    })();

    const editCounts = Object.fromEntries(
        DENOMINATIONS.map((d) => [d, Number(displayBreakdown?.[String(d)] ?? displayBreakdown?.[d] ?? 0)])
    ) as Record<number, number>;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            variant={isEditing ? "amplify" : "compact"}
            layer="derived"
            instance="history-cash-breakdown"
            parentInstance="history-closing-detail"
            title={titleDate}
            subtitle="Arqueo de Efectivo"
            headerTone="petroleum"
            scrollContent={!isEditing}
            footer={
                isEditing ? (
                    <CashCountFooter
                        total={total}
                        instancePrefix="history-cash-breakdown"
                        onCancel={onClose}
                        onSave={onSave}
                        saveLoading={saving}
                        saveLabel="Guardar"
                    />
                ) : undefined
            }
        >
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                {isEditing ? (
                    <DenominationCountGrid
                        counts={editCounts}
                        onAdjust={(denom, delta) => {
                            const current = Number(displayBreakdown?.[String(denom)] ?? displayBreakdown?.[denom] ?? 0);
                            onUpdate?.(String(denom), Math.max(0, current + delta));
                        }}
                        onChange={(denom, raw) => onUpdate?.(String(denom), parseInt(raw, 10) || 0)}
                    />
                ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="space-y-2">
                        {Object.entries(displayBreakdown || {}).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0])).map(([den, qty]) => {
                            const denNum = parseFloat(den);
                            const qtyNum = Number(qty) || 0;
                            const lineTotal = denNum * qtyNum;
                            const imgSrc = CURRENCY_IMAGES[denNum];
                            return (
                            <div key={den} className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-gray-50 rounded-[1.5rem] border border-gray-100/50">
                                <div className="flex items-center gap-3 min-w-0">
                                    {imgSrc ? (
                                        <div className="h-10 w-14 shrink-0 flex items-center justify-center">
                                            <Image
                                                src={imgSrc}
                                                alt={denNum < 1 ? `${(denNum * 100).toFixed(0)}c` : `${den}€`}
                                                width={56}
                                                height={40}
                                                className="h-full w-auto object-contain"
                                            />
                                        </div>
                                    ) : null}
                                    <span className="text-xs font-black text-gray-400 shrink-0">
                                        {denNum < 1 ? `${(denNum * 100).toFixed(0)}c` : `${den}€`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs font-black text-gray-400">
                                        {qtyNum > 0 ? `x${qtyNum}` : ' '}
                                    </span>
                                    <span className="text-sm font-black text-[#36606F] min-w-[50px] text-right">
                                        {lineTotal > 0.005 ? formatCurrencySpanish(lineTotal) : ' '}
                                    </span>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center px-2">
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Total Contado</span>
                        <span className="text-2xl font-black text-[#36606F]">{formatCurrencySpanish(total)}</span>
                    </div>
                    </div>
                </div>
                )}
        </Modal>
    );
};

// --- HELPERS ---

/** Shows an animated skeleton while the browser downloads the photo, then reveals it. */
function PhotoWithSpinner({ src, alt }: { src: string | null; alt: string }) {
    const [loaded, setLoaded] = useState(false);
    if (!src) return null;
    return (
        <div className="relative h-28 w-full flex items-center justify-center">
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-50 rounded-xl border border-zinc-100 animate-pulse">
                    <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                </div>
            )}
            <img
                src={src}
                alt={alt}
                className={`h-28 w-auto max-w-full rounded-xl object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setLoaded(true)}
            />
        </div>
    );
}

const parseLocalSafe = (dateStr: string | null) => {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d);
};

// --- MAIN PAGE ---

export default function HistoryPage() {
    const supabase = createClient();
    const router = useRouter();
    const trackHistoryExportMonths = useTrackModalApply('history-export-month-picker', 'Exportar meses historial');

    const [filterMode, setFilterMode] = useState<'single' | 'range'>('range');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    const handlePrevMonth = () => {
        const current = parseLocalSafe(rangeStart);
        const prev = subMonths(current, 1);
        setRangeStart(format(startOfMonth(prev), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(prev), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const handleNextMonth = () => {
        const current = parseLocalSafe(rangeStart);
        const next = addMonths(current, 1);
        setRangeStart(format(startOfMonth(next), 'yyyy-MM-dd'));
        setRangeEnd(format(endOfMonth(next), 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const [loading, setLoading] = useState(true);
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const [shareBusy, setShareBusy] = useState<null | 'excel' | 'print'>(null);
    const [exportMonthPickerOpen, setExportMonthPickerOpen] = useState(false);
    const [exportPendingFormat, setExportPendingFormat] = useState<'excel' | 'print' | null>(null);
    const [exportSelectedMonths, setExportSelectedMonths] = useState<Set<MonthKey>>(new Set());
    const [exportPickerYear, setExportPickerYear] = useState(() => new Date().getFullYear());

    const [selectedClosing, setSelectedClosing] = useState<any>(null);
    const [showPeriodPerformanceModal, setShowPeriodPerformanceModal] = useState(false);

    // --- Real-time swipe drag state ---
    const modalCardRef = useRef<HTMLDivElement>(null);
    const [swipeNextClosing, setSwipeNextClosing] = useState<any>(null);
    const [swipeDirection, setSwipeDirection] = useState<'left' | 'right'>('left');

    // Refs (always current, never stale inside handlers)
    const swipeDragXRef = useRef(0);
    const swipePhaseRef = useRef<'idle' | 'dragging' | 'animating'>('idle');
    const swipeNextClosingRef = useRef<any>(null);
    const swipeDirectionRef = useRef<'left' | 'right'>('left');

    // React state used only for rendering (driven from refs on key moments)
    const [swipeDragX, setSwipeDragX] = useState(0);
    const [swipePhase, setSwipePhase] = useState<'idle' | 'dragging' | 'animating'>('idle');

    // Helper: update both ref and state atomically
    const setDragX = (v: number) => { swipeDragXRef.current = v; setSwipeDragX(v); };
    const setPhase = (v: 'idle' | 'dragging' | 'animating') => { swipePhaseRef.current = v; setSwipePhase(v); };
    const setNextClosing = (v: any) => { swipeNextClosingRef.current = v; setSwipeNextClosing(v); };
    const setDir = (v: 'left' | 'right') => { swipeDirectionRef.current = v; setSwipeDirection(v); };

    const swipeTouchStartX = useRef<number | null>(null);
    const swipeTouchStartY = useRef<number | null>(null);
    const swipeAxisLocked = useRef<boolean | null>(null);

    // Animate current card out, swap selectedClosing, animate new card in
    const commitNav = (next: any, dir: 'left' | 'right') => {
        const cardW = modalCardRef.current?.offsetWidth ?? 400;
        setDir(dir);
        setNextClosing(next);
        setPhase('animating');
        setDragX(dir === 'left' ? -cardW : cardW);
        setTimeout(() => {
            setSelectedClosing(next);
            setIsEditing(false);
            setLightboxIndex(null);
            // Disable transition so new card jumps to opposite side instantly
            setPhase('idle');
            swipeDragXRef.current = dir === 'left' ? cardW : -cardW;
            setSwipeDragX(dir === 'left' ? cardW : -cardW);
            // Wait for the browser to paint the "jump" frame, then animate to center
            requestAnimationFrame(() => {
                setTimeout(() => {
                    setPhase('animating');
                    setDragX(0);
                    setTimeout(() => {
                        setPhase('idle');
                        setNextClosing(null);
                    }, 300);
                }, 0);
            });
        }, 250);
    };

    const triggerNavigate = (nextClosing: any, dir: 'left' | 'right') => {
        if (!nextClosing) return;
        commitNav(nextClosing, dir);
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (isEditing) return;
        if (swipePhaseRef.current !== 'idle') return; // ignore new touch during animation
        swipeTouchStartX.current = e.touches[0].clientX;
        swipeTouchStartY.current = e.touches[0].clientY;
        swipeAxisLocked.current = null;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isEditing) return;
        if (swipeTouchStartX.current === null || swipeTouchStartY.current === null) return;
        const dx = e.touches[0].clientX - swipeTouchStartX.current;
        const dy = e.touches[0].clientY - swipeTouchStartY.current;
        // Decide axis lock on first 8 px of movement
        if (swipeAxisLocked.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
            swipeAxisLocked.current = Math.abs(dx) > Math.abs(dy);
        }
        if (!swipeAxisLocked.current) return;
        e.preventDefault();
        const currentIndex = closings.findIndex(c => c.id === selectedClosing?.id);
        const dir: 'left' | 'right' = dx < 0 ? 'left' : 'right';
        // Adjacent closing is the one that will slide IN:
        // swiping left (dx<0) → current card moves left → next card (older, lower index) appears from right
        const adjIdx = dir === 'left' ? currentIndex - 1 : currentIndex + 1;
        const adjClosing = adjIdx >= 0 && adjIdx < closings.length ? closings[adjIdx] : null;
        const cardW = modalCardRef.current?.offsetWidth ?? 400;
        const clampedDx = adjClosing
            ? Math.max(-cardW * 0.98, Math.min(cardW * 0.98, dx))
            : dx * 0.15; // rubber-band if no adjacent
        setDir(dir);
        setNextClosing(adjClosing);
        swipeDragXRef.current = clampedDx;
        setSwipeDragX(clampedDx);
        setPhase('dragging');
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (isEditing) return;
        const wasHorizontal = swipeAxisLocked.current;
        swipeTouchStartX.current = null;
        swipeTouchStartY.current = null;
        swipeAxisLocked.current = null;
        // Read from refs — never stale
        const currentDragX = swipeDragXRef.current;
        const currentPhase = swipePhaseRef.current;
        const currentNext = swipeNextClosingRef.current;
        const currentDir = swipeDirectionRef.current;
        if (!wasHorizontal || currentPhase !== 'dragging') {
            setPhase('idle');
            setDragX(0);
            setNextClosing(null);
            return;
        }
        const cardW = modalCardRef.current?.offsetWidth ?? 400;
        const THRESHOLD = cardW * 0.20; // Lower threshold for easier commit (iOS-like)
        if (Math.abs(currentDragX) > THRESHOLD && currentNext) {
            commitNav(currentNext, currentDir);
        } else {
            // Snap back smoothly
            setPhase('animating');
            setDragX(0);
            setTimeout(() => {
                setPhase('idle');
                setNextClosing(null);
            }, 250);
        }
    };

    const openClosingDetail = (closing: { id: string; closed_at?: string; closing_date?: string }) => {
        setSelectedClosing(closing);
    };
    const [showCashDetails, setShowCashDetails] = useState(false);
    const [showClosingModal, setShowClosingModal] = useState(false);
    const [viewMode, setViewMode] = useState<'calendar' | 'table'>('calendar');

    const calendarDays = useMemo(() => {
        const base = filterMode === 'range' && rangeStart ? parseLocalSafe(rangeStart) : parseLocalSafe(selectedDate);
        const startVisible = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [filterMode, rangeStart, selectedDate]);

    const viewMonth = useMemo(() => {
        const base = filterMode === 'range' && rangeStart ? parseLocalSafe(rangeStart) : parseLocalSafe(selectedDate);
        return startOfMonth(base);
    }, [filterMode, rangeStart, selectedDate]);

    const calendarWeeks = useMemo(() => {
        const weeks: Date[][] = [];
        for (let i = 0; i < calendarDays.length; i += 7) {
            weeks.push(calendarDays.slice(i, i + 7));
        }
        return weeks;
    }, [calendarDays]);

    const monthNavLabel =
        filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(parseLocalSafe(rangeStart), parseLocalSafe(rangeEnd))
            ? format(parseLocalSafe(rangeStart), 'MMMM yyyy', { locale: es })
            : filterMode === 'single'
              ? format(parseLocalSafe(selectedDate), 'MMMM yyyy', { locale: es })
              : 'Periodo personalizado';

    const [isEditing, setIsEditing] = useState(false);
    const [editData, setEditData] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);

    const searchParams = useSearchParams();
    const deepLinkClosingRef = useRef<string | null>(null);

    const [closings, setClosings] = useState<any[]>([]);
    const [historicalClosings, setHistoricalClosings] = useState<any[]>([]);
    const [lastClosing, setLastClosing] = useState<any | null>(null);
    const [hourlySales, setHourlySales] = useState<Record<string, number[]>>({});
    const [summary, setSummary] = useState({ totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 });
    const [prevSummary, setPrevSummary] = useState({ totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 });

    const historicalClosingsMap = useMemo(() => {
        const map = new Map<string, any>();
        historicalClosings.forEach((c) => {
            const key = format(new Date(c.closing_date), 'yyyy-MM-dd');
            map.set(key, c);
        });
        return map;
    }, [historicalClosings]);

    const get8DayExpectedSalesDetails = (targetDate: Date) => {
        let sum = 0;
        let count = 0;
        let daysExcluded = 0;

        let weekOffset = 1;
        while (count + daysExcluded < 8 && weekOffset <= 16) {
            const prevDate = subWeeks(targetDate, weekOffset);
            const key = format(prevDate, 'yyyy-MM-dd');
            const closing = historicalClosingsMap.get(key);

            if (prevDate.getMonth() === 7) {
                weekOffset++;
                continue;
            }

            if (closing) {
                const sales = Number(closing.net_sales ?? 0);
                if (sales > 0) {
                    sum += sales;
                    count++;
                } else {
                    daysExcluded++;
                }
            } else {
                daysExcluded++;
            }
            weekOffset++;
        }

        const expectedSales = count > 0 ? sum / count : 0;
        return {
            expectedSales,
            daysUsed: count,
            daysExcluded,
        };
    };

    const get8DayExpectedSales = (targetDate: Date) => {
        return get8DayExpectedSalesDetails(targetDate).expectedSales;
    };

    const { popPercent, popAbsolute, periodRendimiento, prevNetSum, expectedSum, actualWithExpectedSum, currentNetSum } = useMemo(() => {
        let startISO: string;
        let endISO: string;

        if (filterMode === 'single') {
            startISO = selectedDate;
            endISO = selectedDate;
        } else {
            if (!rangeStart || !rangeEnd) {
                return { popPercent: 0, popAbsolute: 0, periodRendimiento: 0, prevNetSum: 0, expectedSum: 0, actualWithExpectedSum: 0, currentNetSum: 0 };
            }
            startISO = rangeStart;
            endISO = rangeEnd;
        }
        
        const start = parseLocalSafe(startISO);
        const end = parseLocalSafe(endISO);
        
        const currentNetSum = closings.reduce((sum, c) => sum + Number(c.net_sales ?? 0), 0);
        
        let prevNetSum = 0;
        closings.forEach((c) => {
            const d = parseLocalSafe(c.closing_date);
            let prevD = subMonths(d, 1);
            if (prevD.getMonth() === 7) {
                prevD = subMonths(d, 2);
            }
            const key = format(prevD, 'yyyy-MM-dd');
            const prevClosing = historicalClosingsMap.get(key);
            if (prevClosing) {
                prevNetSum += Number(prevClosing.net_sales ?? 0);
            }
        });
        
        const popAbsolute = currentNetSum - prevNetSum;
        const popPercent = prevNetSum > 0 ? (popAbsolute / prevNetSum) * 100 : 0;
        
        let expectedSum = 0;
        let actualWithExpectedSum = 0;
        
        closings.forEach((c) => {
            const d = parseLocalSafe(c.closing_date);
            const expected = get8DayExpectedSales(d);
            if (expected > 0) {
                expectedSum += expected;
                actualWithExpectedSum += Number(c.net_sales ?? 0);
            }
        });
        
        const periodRendimiento = expectedSum > 0 
            ? ((actualWithExpectedSum - expectedSum) / expectedSum) * 100 
            : 0;
            
        return { popPercent, popAbsolute, periodRendimiento, prevNetSum, expectedSum, actualWithExpectedSum, currentNetSum };
    }, [filterMode, rangeStart, rangeEnd, selectedDate, closings, historicalClosingsMap]);

    const closingsByDate = useMemo(() => {
        const map = new Map<string, (typeof closings)[number]>();
        closings.forEach((c) => {
            const key = format(new Date(c.closing_date), 'yyyy-MM-dd');
            map.set(key, c);
        });
        return map;
    }, [closings]);
    const [closingPhotoUrls, setClosingPhotoUrls] = useState<{ dataphoneUrl: string | null; bdpUrl: string | null }>({ dataphoneUrl: null, bdpUrl: null });
    const [closingPhotosLoading, setClosingPhotosLoading] = useState(false);
    const [closingPhotosError, setClosingPhotosError] = useState<string | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [closingCalculatorOpen, setClosingCalculatorOpen] = useState(false);

    const closingPhotoSlides = useMemo((): ImageLightboxSlide[] => {
        const slides: ImageLightboxSlide[] = [];
        if (closingPhotoUrls.dataphoneUrl) {
            slides.push({ src: closingPhotoUrls.dataphoneUrl, alt: 'Totales datáfonos' });
        }
        if (closingPhotoUrls.bdpUrl) {
            slides.push({ src: closingPhotoUrls.bdpUrl, alt: 'Informe TPV' });
        }
        return slides;
    }, [closingPhotoUrls]);

    const openClosingPhotoLightbox = (alt: string) => {
        const idx = closingPhotoSlides.findIndex((s) => s.alt === alt);
        if (idx >= 0) setLightboxIndex(idx);
    };

    useEffect(() => {
        checkUserRole();
        fetchHistory();
    }, [rangeStart, rangeEnd, selectedDate, filterMode]);

    useEffect(() => {
        const closingId = searchParams.get('closingId')?.trim();
        if (!closingId || deepLinkClosingRef.current === closingId || loading) return;

        const found = closings.find((c) => c.id === closingId);
        if (found) {
            deepLinkClosingRef.current = closingId;
            openClosingDetail(found);
            return;
        }

        void (async () => {
            const { data, error } = await supabase
                .from('cash_closings')
                .select('*')
                .eq('id', closingId)
                .maybeSingle();

            if (error || !data) {
                toast.error('No se encontró el cierre de la notificación');
                return;
            }

            deepLinkClosingRef.current = closingId;
            openClosingDetail(data);
            const closedAt = new Date(data.closed_at);
            if (!Number.isNaN(closedAt.getTime())) {
                setSelectedDate(format(closedAt, 'yyyy-MM-dd'));
            }
        })();
    }, [searchParams, closings, loading]);



    useEffect(() => {
        if (!selectedClosing) {
            setClosingPhotoUrls({ dataphoneUrl: null, bdpUrl: null });
            setClosingPhotosError(null);
            return;
        }

        const dataphonePath = selectedClosing.dataphone_totals_photo_path as string | null | undefined;
        const bdpPath = selectedClosing.bdp_closing_ticket_photo_path as string | null | undefined;

        if (!dataphonePath && !bdpPath) {
            setClosingPhotoUrls({ dataphoneUrl: null, bdpUrl: null });
            setClosingPhotosError(null);
            return;
        }

        let cancelled = false;
        setClosingPhotosLoading(true);
        setClosingPhotosError(null);

        getCashClosingPhotoUrlsAction({ dataphonePath, bdpPath })
            .then((result) => {
                if (cancelled) return;
                if (!result.success) {
                    setClosingPhotoUrls({ dataphoneUrl: null, bdpUrl: null });
                    setClosingPhotosError(result.error);
                    toast.error(result.error);
                    return;
                }
                setClosingPhotoUrls({ dataphoneUrl: result.dataphoneUrl, bdpUrl: result.bdpUrl });
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                const msg = err instanceof Error ? err.message : 'No se pudieron cargar las fotos del cierre';
                setClosingPhotosError(msg);
                toast.error(msg);
            })
            .finally(() => {
                if (!cancelled) setClosingPhotosLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedClosing?.id, selectedClosing?.dataphone_totals_photo_path, selectedClosing?.bdp_closing_ticket_photo_path]);

    async function checkUserRole() {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (user) {
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            setIsManager(profile?.role === 'manager');
        }
    }

    async function fetchHistory() {
        setLoading(true);
        try {
            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                startISO = selectedDate;
                endISO = selectedDate;
            } else {
                if (!rangeStart || !rangeEnd) {
                    setClosings([]);
                    setLastClosing(null);
                    setLoading(false);
                    return;
                }
                startISO = rangeStart;
                endISO = rangeEnd;
            }

            const start = parseLocalSafe(startISO);
            const end = parseLocalSafe(endISO);
            const diffDays = differenceInDays(end, start) + 1;

            const prevStart = subMonths(start, 1);
            const prevEnd = filterMode === 'single' ? subMonths(end, 1) : addDays(prevStart, diffDays - 1);
            
            const prevStartISO = format(prevStart, 'yyyy-MM-dd');
            const prevEndISO = format(prevEnd, 'yyyy-MM-dd');
            const histStartISO = format(subMonths(start, 4), 'yyyy-MM-dd');

            const closingsPromise = supabase
                .from('cash_closings')
                .select('*')
                .gte('closing_date', startISO)
                .lte('closing_date', endISO)
                .order('closing_date', { ascending: false });

            const historicalPromise = supabase
                .from('cash_closings')
                .select('*')
                .gte('closing_date', histStartISO)
                .lte('closing_date', endISO);

            const lastClosingPromise = supabase
                .from('cash_closings')
                .select('*')
                .order('closing_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            const summaryPromise = supabase.rpc('get_cash_closings_summary', {
                p_start_date: startISO,
                p_end_date: endISO
            });

            const prevSummaryPromise = supabase.rpc('get_cash_closings_summary', {
                p_start_date: prevStartISO,
                p_end_date: prevEndISO
            });

            const [closingsRes, historicalRes, lastClosingRes, summaryRes, prevSummaryRes] = await Promise.all([
                closingsPromise,
                historicalPromise,
                lastClosingPromise,
                summaryPromise,
                prevSummaryPromise
            ]);

            if (closingsRes.error) throw closingsRes.error;
            if (historicalRes.error) throw historicalRes.error;
            if (lastClosingRes.error) throw lastClosingRes.error;

            setClosings(closingsRes.data || []);
            setHistoricalClosings(historicalRes.data || []);
            setLastClosing(lastClosingRes.data ?? null);
            setSummary(summaryRes.data || { totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 });
            setPrevSummary(prevSummaryRes.data || { totalNet: 0, totalGross: 0, avgTicket: 0, count: 0 });

            try {
                const { data: hourlyData, error: hourlyError } = await supabase
                    .rpc('get_hourly_sales', {
                        p_start_date: startISO,
                        p_end_date: endISO
                    });

                if (!hourlyError && hourlyData) {
                    const hourlyMap: Record<string, number[]> = {};
                    hourlyData.forEach((row: any) => {
                        const date = row.fecha;
                        if (!hourlyMap[date]) {
                            hourlyMap[date] = new Array(24).fill(0);
                        }
                        if (row.hora >= 0 && row.hora < 24) {
                            hourlyMap[date][row.hora] = Number(row.total);
                        }
                    });
                    setHourlySales(hourlyMap);
                }
            } catch (rpcErr) {
                console.warn('Hourly sales RPC failed', rpcErr);
            }
        } catch (err) {
            console.error('Error fetching history:', err);
            toast.error("Error al cargar datos históricos");
        } finally {
            setLoading(false);
        }
    }

    const getCurrentViewMonthKey = (): MonthKey => {
        const base = filterMode === 'range' && rangeStart ? parseLocalSafe(rangeStart) : parseLocalSafe(selectedDate);
        return toMonthKey(startOfMonth(base));
    };

    const getInitialExportMonths = (): Set<MonthKey> => {
        if (filterMode === 'range' && rangeStart && rangeEnd) {
            const start = startOfMonth(parseLocalSafe(rangeStart));
            const end = startOfMonth(parseLocalSafe(rangeEnd));
            const months = new Set<MonthKey>();
            let cursor = start;
            while (cursor <= end) {
                months.add(toMonthKey(cursor));
                cursor = addMonths(cursor, 1);
            }
            if (months.size > 0) return months;
        }
        return new Set([getCurrentViewMonthKey()]);
    };

    const openExportMonthPicker = (fmt: 'excel' | 'print') => {
        setShareMenuOpen(false);
        setExportPendingFormat(fmt);
        const initialMonths = getInitialExportMonths();
        const currentKey = getCurrentViewMonthKey();
        setExportSelectedMonths(initialMonths);
        setExportPickerYear(Number(currentKey.split('-')[0]));
        setExportMonthPickerOpen(true);
    };

    const toggleExportMonth = (key: MonthKey) => {
        setExportSelectedMonths((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    async function fetchClosingsForMonths(monthKeys: Set<MonthKey>): Promise<any[]> {
        if (monthKeys.size === 0) return [];
        const ranges = Array.from(monthKeys).map(monthKeyToRange);
        const startISO = ranges.reduce((min, r) => (r.start < min ? r.start : min), ranges[0].start);
        const endISO = ranges.reduce((max, r) => (r.end > max ? r.end : max), ranges[0].end);

        const { data, error } = await supabase
            .from('cash_closings')
            .select('*')
            .gte('closing_date', startISO)
            .lte('closing_date', endISO)
            .order('closing_date', { ascending: false });

        if (error) throw error;

        return (data || []).filter((c) => monthKeys.has(toMonthKey(parseLocalSafe(c.closing_date))));
    }

    const confirmExport = async () => {
        if (!exportPendingFormat || exportSelectedMonths.size === 0) {
            toast.error('Selecciona al menos un mes.');
            return;
        }
        if (shareBusy) return;

        setShareBusy(exportPendingFormat === 'excel' ? 'excel' : 'print');
        try {
            const closingsData = await fetchClosingsForMonths(exportSelectedMonths);
            if (closingsData.length === 0) {
                toast.error('No hay cierres en los meses seleccionados.');
                return;
            }

            const sortedKeys = Array.from(exportSelectedMonths).sort();
            const titleLabel = sortedKeys.length === 1
                ? `Cierres — ${monthKeyLabel(sortedKeys[0])}`
                : `Cierres — ${monthKeyLabel(sortedKeys[0])} a ${monthKeyLabel(sortedKeys[sortedKeys.length - 1])}`;

            if (exportPendingFormat === 'excel') {
                await exportClosingsToExcel(closingsData, sortedKeys);
                toast.success('Excel descargado.');
            } else {
                printClosingsTable(closingsData, titleLabel);
            }

            trackHistoryExportMonths(
                sortedKeys.length === 1
                    ? monthKeyLabel(sortedKeys[0])
                    : `${monthKeyLabel(sortedKeys[0])} — ${monthKeyLabel(sortedKeys[sortedKeys.length - 1])} (${sortedKeys.length} meses)`,
                { months: sortedKeys.join(','), format: exportPendingFormat }
            );

            setExportMonthPickerOpen(false);
            setExportPendingFormat(null);
        } catch (e) {
            console.error(e);
            toast.error(exportPendingFormat === 'excel' ? 'Error exportando a Excel.' : 'Error al imprimir.');
        } finally {
            setShareBusy(null);
        }
    };

    const formatValue = (val: number, type: MetricType) => {
        if (type === 'tickets_count') return val === 0 ? ' ' : val.toLocaleString('es-ES');
        if (val === 0) return " ";
        return formatCurrencySpanish(val);
    };

    /** Descuadre de cero se muestra: CONTENIDO-Y-TONO §3. */
    const formatDifference = (val: number) => formatCurrencySpanish(val);

    const lastClosingMetrics = useMemo(() => {
        if (!lastClosing) {
            return {
                weatherLabel: null as string | null,
                weatherIcon: null as string | null,
                tickets: 0,
                avgTicket: 0,
                tpvSales: 0,
                netSales: 0,
                salesCard: 0,
                cashCounted: 0,
                salesPending: 0,
                debtRecovered: 0,
                difference: 0,
            };
        }
        const tickets = Number(lastClosing.tickets_count ?? 0);
        const tpvSales = Number(lastClosing.tpv_sales ?? 0);
        const weatherId = weatherIdFromLabel(lastClosing.weather);
        const weatherOpt = CLOSING_WEATHER_OPTIONS.find((o) => o.id === weatherId);
        return {
            weatherLabel: lastClosing.weather || null,
            weatherIcon: weatherOpt?.icon ?? null,
            tickets,
            avgTicket: tickets > 0 ? tpvSales / tickets : 0,
            tpvSales,
            netSales: Number(lastClosing.net_sales ?? 0),
            salesCard: Number(lastClosing.sales_card ?? 0),
            cashCounted: Number(lastClosing.cash_counted ?? 0),
            salesPending: Number(lastClosing.sales_pending ?? 0),
            debtRecovered: Number(lastClosing.debt_recovered ?? 0),
            difference: Number(lastClosing.difference ?? 0),
        };
    }, [lastClosing]);


    // Solo actualizan estado local; la base de datos no se toca hasta que el usuario pulse "Guardar Cierre".
    const handleFieldUpdate = (field: string, value: number) => {
        if (!editData) return;
        const newData = { ...editData, [field]: value };
        if (field === 'tpv_sales') newData.net_sales = value / 1.10;
        const cashSalesToday = newData.tpv_sales - newData.sales_card - newData.sales_pending;
        const expectedCash = cashSalesToday + newData.debt_recovered;
        newData.cash_expected = expectedCash;
        const diff = newData.cash_counted - expectedCash;
        newData.difference = diff;
        setEditData(newData);
    };

    const parseDateTimeLocal = (value: string): Date => {
        // TIMEZONE IMMUNITY: no Date('YYYY-MM-DD...') parsing
        const [datePart, timePart] = value.split('T');
        const [yStr, mStr, dStr] = (datePart || '').split('-');
        const [hhStr, mmStr] = (timePart || '').split(':');
        const y = Number(yStr);
        const m = Number(mStr);
        const d = Number(dStr);
        const hh = Number(hhStr ?? 0);
        const mm = Number(mmStr ?? 0);
        if (!y || !m || !d) return new Date();
        return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0);
    };

    const formatDateTimeLocalInput = (d: Date): string => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const formatClosingDate = (d: Date): string => {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const handleBreakdownUpdate = (denomination: string, qty: number) => {
        if (!editData) {
            toast.error('No hay datos de edición del cierre');
            return;
        }
        const safeQty = Math.max(0, Number.isFinite(qty) ? qty : 0);
        const newBreakdown = { ...(editData.breakdown ?? {}), [denomination]: safeQty };
        const totalCounted = Object.entries(newBreakdown).reduce(
            (sum, [den, q]) => sum + (parseFloat(den) * (Number(q) || 0)),
            0
        );
        const diff = totalCounted - Number(editData.cash_expected || 0);
        const withDrawn = totalCounted;
        const cLeft = 0;
        setEditData({
            ...editData,
            breakdown: newBreakdown,
            cash_counted: totalCounted,
            difference: diff,
            cash_withdrawn: withDrawn,
            cash_left: cLeft,
        });
    };

    const persistEditData = async (opts?: { exitEdit?: boolean; successMessage?: string }) => {
        if (!editData) {
            toast.error('No hay datos de edición para guardar');
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.from('cash_closings').update({
                closed_at: editData.closed_at,
                closing_date: editData.closing_date,
                tpv_sales: editData.tpv_sales,
                net_sales: editData.tpv_sales / 1.10,
                sales_card: editData.sales_card,
                sales_pending: editData.sales_pending,
                debt_recovered: editData.debt_recovered,
                cash_expected: editData.cash_expected,
                cash_counted: editData.cash_counted,
                difference: editData.difference,
                breakdown: editData.breakdown,
                cash_withdrawn: editData.cash_withdrawn,
                cash_left: editData.cash_left,
            }).eq('id', editData.id);
            if (error) throw error;
            toast.success(opts?.successMessage ?? 'Cierre actualizado');
            setSelectedClosing(editData);
            setEditData({ ...editData });
            if (opts?.exitEdit !== false) setIsEditing(false);
            fetchHistory();
        } catch (err: any) {
            toast.error("Error al actualizar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClosing = async () => {
        if (!selectedClosing) return;
        if (!confirm("¿Estás seguro de eliminar este cierre?")) return;
        setLoading(true);
        try {
            const paths = [
                selectedClosing.dataphone_totals_photo_path,
                selectedClosing.bdp_closing_ticket_photo_path,
            ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);

            if (paths.length > 0) {
                const photoDelete = await deleteCashClosingPhotosAction(paths);
                if (!photoDelete.success) {
                    toast.error(`No se pudieron borrar las fotos: ${photoDelete.error}`);
                }
            }

            const { error } = await supabase.from('cash_closings').delete().eq('id', selectedClosing.id);
            if (error) throw error;
            toast.success("Cierre eliminado");
            setSelectedClosing(null);
            setLightboxIndex(null);
            setClosingCalculatorOpen(false);
            fetchHistory();
        } catch (err: any) {
            toast.error("Error al eliminar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigateClosing = (direction: 'next' | 'prev') => {
        if (!selectedClosing) return;
        const currentIndex = closings.findIndex(c => c.id === selectedClosing.id);
        const nextIndex = direction === 'next' ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex >= 0 && nextIndex < closings.length) {
            const dir = direction === 'next' ? 'left' : 'right';
            triggerNavigate(closings[nextIndex], dir);
        }
    };

    return (
        <>
        <DashboardDetailLayout
            title="Cierres"
            showBackButton={false}
            template="list"
            work={viewMode === 'calendar' ? 'calendar' : 'table'}
            maxWidthClass="max-w-none"
            className={cn('print:bg-white print:p-0 print:pb-0', viewMode === 'calendar' && 'month-cal-shell')}
            cardClassName={cn('print:rounded-none print:shadow-none', viewMode === 'calendar' && 'month-cal-card')}
            contentClassName={cn('p-0 flex flex-col min-h-0', viewMode === 'calendar' && 'month-cal-body')}
            periodStartSlot={
                <PetroleumSegmented
                    instance="history-vista"
                    density="compact"
                    value={viewMode}
                    onChange={(next) => setViewMode(next as 'calendar' | 'table')}
                    aria-label="Vista de cierres"
                    options={[
                        { value: 'calendar', label: 'Mes' },
                        { value: 'table', label: 'Tabla' },
                    ]}
                />
            }
            periodSlot={
                <PeriodNav
                    label={monthNavLabel}
                    onPrev={handlePrevMonth}
                    onNext={handleNextMonth}
                    onLabelClick={() => setIsTimeFilterOpen(true)}
                />
            }
            rightSlot={
                <div className="flex items-center gap-1 shrink-0">
                    <PeriodFilterButton instance="history-period-filter" onClick={() => setIsTimeFilterOpen(true)} />
                    {viewMode === 'table' ? (
                        <Button
                            type="button"
                            variant="tertiary"
                            instance="history-compartir"
                            onClick={() => setShareMenuOpen(true)}
                            disabled={!!shareBusy}
                            aria-label="Compartir"
                            icon={<Share size={14} strokeWidth={2} />}
                        />
                    ) : null}
                </div>
            }
            leadSlot={
                <div
                    data-element="history-lead-cards"
                    className="flex w-full flex-col gap-2 print:hidden"
                >
                    <div
                        data-element="history-month-summary"
                        className="rounded-[var(--radio-control)] bg-[rgb(255_255_255/0.1)] px-2 py-1"
                    >
                        <div className="flex items-center justify-start">
                            <span className="text-xs font-black text-zinc-950 leading-none">
                                Mensual
                            </span>
                        </div>
                        <div className="mt-1 grid grid-cols-3">
                            <div className="flex flex-col items-center justify-center text-center">
                                <div className="flex items-center justify-center leading-none">
                                    <span className="whitespace-nowrap text-sm sm:text-base md:text-lg font-black text-zinc-950 tabular-nums leading-none month-cal-kpi-value">
                                        {formatValue(summary.totalNet, 'net_sales')}
                                    </span>
                                </div>
                                <span className="mt-0 text-[6.5px] md:text-[7.5px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                                    VENTA NETA
                                </span>
                            </div>
                            <div
                                onClick={() => setShowPeriodPerformanceModal(true)}
                                className="relative flex flex-col items-center justify-center text-center cursor-pointer active:scale-95 transition-transform before:absolute before:inset-0 before:-my-3 before:min-h-12 before:content-['']"
                            >
                                <div className="flex items-center justify-center gap-1 leading-none">
                                    {(() => {
                                        const isNeutral = popPercent >= -5 && popPercent <= 5;
                                        const triangleSymbol = isNeutral ? '' : (popPercent > 5 ? '▲' : '▼');
                                        return popPercent === 0 ? null : (
                                            <span className="whitespace-nowrap text-sm sm:text-base md:text-lg font-extrabold tabular-nums flex items-center gap-1 month-cal-kpi-value text-white leading-none">
                                                {!isNeutral && <span className="text-[10px] sm:text-xs md:text-sm leading-none">{triangleSymbol}</span>}
                                                <span>{Math.abs(popPercent).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%</span>
                                            </span>
                                        );
                                    })()}
                                </div>
                                <span className="mt-0 text-[6.5px] md:text-[7.5px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                                    RENDIMIENTO
                                </span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center">
                                <div className="flex items-center justify-center leading-none">
                                    <span className="whitespace-nowrap text-sm sm:text-base md:text-lg font-black text-zinc-950 tabular-nums leading-none month-cal-kpi-value">
                                        {formatValue(summary.totalGross, 'tpv_sales')}
                                    </span>
                                </div>
                                <span className="mt-0 text-[6.5px] md:text-[7.5px] font-black text-zinc-400 uppercase tracking-widest leading-none">
                                    VENTAS
                                </span>
                            </div>
                        </div>
                    </div>

                    <div
                        data-element="history-last-closing-summary"
                        className="rounded-[var(--radio-control)] bg-[rgb(255_255_255/0.1)] px-2 py-2"
                    >
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-black text-zinc-950 leading-none">
                                Último cierre
                            </span>
                            <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-0.5 text-[9px] font-normal text-zinc-400 tabular-nums">
                                {lastClosingMetrics.weatherLabel ? (
                                    <span className="inline-flex items-center gap-1">
                                        {lastClosingMetrics.weatherIcon ? (
                                            <img
                                                src={lastClosingMetrics.weatherIcon}
                                                alt=""
                                                className="h-3 w-3 object-contain"
                                            />
                                        ) : (
                                            <CloudSun size={11} className="shrink-0 opacity-70" aria-hidden />
                                        )}
                                        <span>{lastClosingMetrics.weatherLabel}</span>
                                    </span>
                                ) : (
                                    <span> </span>
                                )}
                                <span>
                                    {lastClosingMetrics.tickets === 0
                                        ? ' '
                                        : `${lastClosingMetrics.tickets.toLocaleString('es-ES')} tickets`}
                                </span>
                                <span>
                                    {lastClosingMetrics.avgTicket === 0
                                        ? ' '
                                        : `${formatCurrencySpanish(lastClosingMetrics.avgTicket)} ticket medio`}
                                </span>
                            </div>
                        </div>
                        <div className="mt-8 grid grid-cols-4 gap-0.5">
                            {(
                                [
                                    {
                                        label: 'Ventas',
                                        value: lastClosing
                                            ? formatValue(lastClosingMetrics.tpvSales, 'tpv_sales')
                                            : ' ',
                                    },
                                    {
                                        label: 'Venta neta',
                                        value: lastClosing
                                            ? formatValue(lastClosingMetrics.netSales, 'net_sales')
                                            : ' ',
                                    },
                                    {
                                        label: 'Tarjeta',
                                        value: lastClosing
                                            ? formatValue(lastClosingMetrics.salesCard, 'tpv_sales')
                                            : ' ',
                                    },
                                    {
                                        label: 'Efectivo',
                                        value: lastClosing
                                            ? formatValue(lastClosingMetrics.cashCounted, 'cash_counted')
                                            : ' ',
                                    },
                                ] as const
                            ).map((item) => (
                                <div
                                    key={item.label}
                                    className="flex min-w-0 flex-col items-center justify-center text-center"
                                >
                                    <span className="text-[9px] sm:text-[10px] md:text-xs font-black text-zinc-950 tabular-nums leading-none month-cal-kpi-value">
                                        {item.value}
                                    </span>
                                    <span className="mt-1 text-[6.5px] md:text-[7.5px] font-black text-zinc-400 uppercase tracking-wider leading-tight">
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-0.5">
                            {(
                                [
                                    {
                                        label: 'Pendiente pago',
                                        value: lastClosing
                                            ? formatValue(lastClosingMetrics.salesPending, 'tpv_sales')
                                            : ' ',
                                    },
                                    {
                                        label: 'Cobros pendientes',
                                        value: lastClosing
                                            ? formatValue(lastClosingMetrics.debtRecovered, 'tpv_sales')
                                            : ' ',
                                    },
                                    {
                                        label: 'Diferencia',
                                        value: lastClosing
                                            ? formatDifference(lastClosingMetrics.difference)
                                            : ' ',
                                    },
                                ] as const
                            ).map((item) => (
                                <div
                                    key={item.label}
                                    className="flex min-w-0 flex-col items-center justify-center text-center"
                                >
                                    <span className="text-[9px] sm:text-[10px] md:text-xs font-black text-zinc-950 tabular-nums leading-none month-cal-kpi-value">
                                        {item.value}
                                    </span>
                                    <span className="mt-1 text-[6.5px] md:text-[7.5px] font-black text-zinc-400 uppercase tracking-wider leading-tight">
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            }
        >
                        <div className={cn(
                            'pb-1 md:pb-2 pt-0.5 px-0',
                            viewMode === 'calendar' && 'flex-1 min-h-0 flex flex-col'
                        )}>
                            {viewMode === 'table' ? (
                                <div className="py-1 flex flex-col gap-1 shrink-0 min-w-0">
                                    <div data-table-piece className="mx-auto w-[97%] min-w-0 overflow-x-hidden print:overflow-visible print-table-cierres">
                                        <div className="hidden print:block text-lg font-black text-zinc-800 p-4 pb-2">Cierres — Historial</div>
                                        {loading ? (
                                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                                <LoadingSpinner size="lg" className="text-ds-marca" />
                                            </div>
                                        ) : closings.length === 0 ? (
                                            <EmptyState
                                                instance="history-cierres-none"
                                                variant="none"
                                                title="Sin actividad"
                                            />
                                        ) : (
                                            <table data-component={TABLE_COMPONENT_ID} data-instance="history-cierres" className="w-full text-left border-collapse table-fixed">
                                                <thead>
                                                    <tr>
                                                        <th className="py-1.5 px-0.5 md:px-1 whitespace-nowrap">Fecha</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">Ventas €</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">Neta €</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">Ticks</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">TM €</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">Cash €</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">Card €</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">Pend. €</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">Recup. €</th>
                                                        <th className="py-1.5 px-0.5 md:px-1 text-right whitespace-nowrap">Dif. €</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-[8px] md:text-[9px] font-bold text-zinc-600 bg-white">
                                                    {[...closings]
                                                        .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime())
                                                        .map((c) => {
                                                            const d = new Date(c.closed_at);
                                                            const avgTicket = (c.tickets_count || 0) > 0 ? (c.tpv_sales || 0) / c.tickets_count : 0;
                                                            const diff = c.difference ?? 0;
                                                            const formatCompact = (val: number) => formatCurrencySpanish(val || 0);

                                                            return (
                                                                <tr
                                                                    key={c.id}
                                                                    onClick={() => openClosingDetail(c)}
                                                                    className="group hover:bg-zinc-50/80 transition-colors cursor-pointer active:bg-zinc-100 border-b border-zinc-50/40 last:border-0"
                                                                >
                                                                    <td className="py-1 px-0.5 md:px-1 whitespace-nowrap text-zinc-500 font-mono text-[7.5px] md:text-[8px]">
                                                                        {format(d, 'd/M/yy', { locale: es })}
                                                                    </td>
                                                                    <td className="py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px]">
                                                                        {formatCompact(c.tpv_sales)}
                                                                    </td>
                                                                    <td className="py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px] text-emerald-600">
                                                                        {formatCompact(c.net_sales)}
                                                                    </td>
                                                                    <td className="py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px]">
                                                                        {(c.tickets_count || 0).toLocaleString('es-ES')}
                                                                    </td>
                                                                    <td className="py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px] text-[#36606F]/80">
                                                                        {avgTicket === 0 ? ' ' : formatCurrencySpanish(avgTicket)}
                                                                    </td>
                                                                    <td className="py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px]">
                                                                        {formatCompact(c.cash_counted)}
                                                                    </td>
                                                                    <td className="py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px]">
                                                                        {formatCompact(c.sales_card)}
                                                                    </td>
                                                                    <td className="py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px] text-orange-600/70">
                                                                        {formatCompact(c.sales_pending)}
                                                                    </td>
                                                                    <td className="py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px] text-blue-600/70">
                                                                        {formatCompact(c.debt_recovered)}
                                                                    </td>
                                                                    <td className={cn(
                                                                        "py-1 px-0.5 md:px-1 text-right font-black tabular-nums whitespace-nowrap text-[8px] md:text-[9px]",
                                                                        diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-zinc-400"
                                                                    )}>
                                                                        {diff === 0 ? ' ' : formatCurrencySpanish(diff)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="min-w-0 flex-1 min-h-0 flex flex-col">
                                    {loading ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <LoadingSpinner size="lg" className="text-ds-marca" />
                                        </div>
                                    ) : (
                                        <>
                                            <MonthCalendarFrame>
                                                <div className="month-cal-weeks">
                                                {calendarWeeks.map((week) => (
                                                    <div key={format(week[0], 'yyyy-MM-dd')} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0 month-cal-week">
                                                        {week.map((day) => {
                                                            const key = format(day, 'yyyy-MM-dd');
                                                            const closing = closingsByDate.get(key);
                                                            const isViewMonthDay = isSameMonth(day, viewMonth);
                                                            const today = isToday(day);
                                                            const isPastDay = isViewMonthDay && isBefore(day, startOfDay(new Date()));
                                                            const pastDayBg = isPastDay ? 'bg-zinc-50/90' : 'bg-white';

                                                            if (!closing) {
                                                                return (
                                                                    <div
                                                                        key={key}
                                                                        className={cn(
                                                                            'relative flex flex-col p-0.5 sm:p-1 month-cal-cell',
                                                                            'border-r border-gray-100 last:border-r-0',
                                                                            pastDayBg,
                                                                            !isViewMonthDay && 'opacity-25',
                                                                            today && isViewMonthDay && !isPastDay && 'bg-blue-50/10'
                                                                        )}
                                                                    >
                                                                        <ClosingCalendarDayLabel day={day} today={today} isViewMonthDay={isViewMonthDay} />
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <button
                                                                    key={closing.id}
                                                                    type="button"
                                                                    onClick={() => openClosingDetail(closing)}
                                                                    className={cn(
                                                                        'group relative flex flex-col text-left transition-colors p-0.5 sm:p-1 month-cal-cell',
                                                                        'border-r border-gray-100 last:border-r-0 hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer',
                                                                        pastDayBg,
                                                                        !isViewMonthDay && 'opacity-25',
                                                                        today && isViewMonthDay && !isPastDay && 'bg-blue-50/10'
                                                                    )}
                                                                >
                                                                    <ClosingCalendarDayLabel day={day} today={today} isViewMonthDay={isViewMonthDay} />
                                                                    <div className="mt-0.5 flex min-h-0 flex-1 flex-col items-center px-0.5 pb-0.5 overflow-hidden">
                                                                        <ClosingCalendarCellContent
                                                                            closing={closing}
                                                                            expectedSales={get8DayExpectedSales(day)}
                                                                        />
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                                </div>
                                            </MonthCalendarFrame>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
        </DashboardDetailLayout>

            {selectedClosing && (
                <>
                    <QuickCalculatorModal
                        isOpen={closingCalculatorOpen}
                        onClose={() => setClosingCalculatorOpen(false)}
                        overlayClassName="z-[320]"
                    />
                    <FloatingCalculatorFab
                        isOpen={closingCalculatorOpen}
                        onToggle={() => setClosingCalculatorOpen(true)}
                        className="z-[310]"
                    />
                </>
            )}

            {selectedClosing && (
                <Modal
                    open={true}
                    onClose={() => {
                        setSelectedClosing(null);
                        setLightboxIndex(null);
                        setClosingCalculatorOpen(false);
                        setIsEditing(false);
                    }}
                    variant="standard"
                    layer="base"
                    instance="history-closing-detail"
                    title={(() => {
                        const d = new Date(selectedClosing.closed_at);
                        return isNaN(d.getTime()) ? 'Fecha inválida' : format(d, 'eeee d MMMM', { locale: es });
                    })()}
                    subtitle="Detalle de cierre"
                    headerTone="petroleum"
                    scrollContent={false}
                    headerTrailing={
                        isManager ? (
                            <>
                                {isEditing ? (
                                    <button
                                        type="button"
                                        onClick={handleDeleteClosing}
                                        className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                                        aria-label="Eliminar cierre"
                                    >
                                        <Trash2 size={18} strokeWidth={2.5} />
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => { setEditData({ ...selectedClosing, breakdown: selectedClosing.breakdown ?? {} }); setIsEditing(true); }}
                                        className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                                        aria-label="Editar cierre"
                                    >
                                        <Pencil size={18} strokeWidth={2.5} />
                                    </button>
                                )}
                            </>
                        ) : null
                    }
                >
                    <div className="relative flex flex-col items-center gap-4 w-full animate-in zoom-in-95 duration-200">
                        <div
                            ref={modalCardRef}
                            className="relative bg-white rounded-[3rem] w-full overflow-hidden shadow-2xl flex flex-col shrink-0"
                            style={{
                                transform: `translateX(${swipeDragX}px)`,
                                transition: swipePhase === 'animating' ? 'transform 300ms cubic-bezier(0.25, 0.1, 0.25, 1.0)' : 'none',
                                willChange: 'transform',
                            }}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            onClick={e => e.stopPropagation()}
                        >
                        <div className="flex items-center justify-center gap-1 px-8 pt-3 md:gap-2">
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleNavigateClosing('prev'); }}
                                className="p-1 transition-all disabled:opacity-30 active:scale-90 text-zinc-400 hover:text-zinc-700 shrink-0 min-h-[32px] min-w-[32px] flex items-center justify-center group"
                                disabled={closings.findIndex(c => c.id === selectedClosing.id) === closings.length - 1}
                                aria-label="Día anterior"
                                title="Día anterior"
                            >
                                <ChevronLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                            </button>
                            {isEditing ? (
                                <input
                                    type="datetime-local"
                                    value={(() => {
                                        const raw = editData?.closed_at ?? selectedClosing.closed_at;
                                        const d = new Date(raw);
                                        return isNaN(d.getTime()) ? '' : formatDateTimeLocalInput(d);
                                    })()}
                                    onChange={(e) => {
                                        if (!editData) return;
                                        const d = parseDateTimeLocal(e.target.value);
                                        setEditData({
                                            ...editData,
                                            closed_at: d.toISOString(),
                                            closing_date: formatClosingDate(d),
                                        });
                                    }}
                                    className="bg-transparent border border-zinc-200 rounded-xl px-2 py-1 text-[#36606F] font-black text-[10px] sm:text-[11px] uppercase tracking-widest text-center outline-none focus:ring-1 focus:ring-[#36606F]/30 w-auto cursor-pointer min-h-[32px]"
                                    aria-label="Fecha y hora del cierre"
                                />
                            ) : null}
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleNavigateClosing('next'); }}
                                className="p-1 transition-all disabled:opacity-30 active:scale-90 text-zinc-400 hover:text-zinc-700 shrink-0 min-h-[32px] min-w-[32px] flex items-center justify-center group"
                                disabled={closings.findIndex(c => c.id === selectedClosing.id) === 0}
                                aria-label="Día siguiente"
                                title="Día siguiente"
                            >
                                <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        </div>
                        <div className="px-8 pb-8 pt-3 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                            {(() => {
                                const current = isEditing ? editData : selectedClosing;
                                const getValue = (key: keyof typeof current) => Number(current?.[key] ?? 0);
                                const collectionsValue = Number((current as any)?.collections ?? (current as any)?.debt_recovered ?? 0);
 
                                const RowItem = ({
                                    label,
                                    value,
                                    fieldKey,
                                    editable = false,
                                    isDiff = false,
                                    onClick,
                                    openEditor,
                                }: {
                                    label: string;
                                    value: number;
                                    fieldKey?: string;
                                    editable?: boolean;
                                    isDiff?: boolean;
                                    onClick?: () => void;
                                    /** En edición: abre editor externo (p. ej. desglose de efectivo) */
                                    openEditor?: () => void;
                                }) => {
                                    const hasValue = Math.abs(value) >= 0.005;
                                    let text = '';
                                    if (hasValue) {
                                        if (isDiff) {
                                            text = `${value > 0 ? '+' : ''}${formatCurrencyModal(value)}`;
                                        } else {
                                            text = formatCurrencyModal(value);
                                        }
                                    }
                                    const isNeg = value < -0.005;
                                    const isPos = value > 0.005;
                                    const diffTone = isDiff && hasValue
                                        ? isPos
                                            ? 'text-emerald-500'
                                            : 'text-rose-500'
                                        : null;
 
                                    return (
                                        <div className="grid min-h-[30px] grid-cols-[7.5rem_1fr] items-center gap-x-2 sm:grid-cols-[8.5rem_1fr] sm:gap-x-3 w-full max-w-xs mx-auto">
                                            <span className="text-[10px] font-bold uppercase leading-tight text-[#36606F] sm:text-[11px]">
                                                {label}
                                            </span>
                                            <div className="flex min-w-0 items-center justify-center">
                                                {isEditing && openEditor ? (
                                                    <div className="w-[8.75rem] sm:w-[9.5rem]">
                                                        <Button
                                                            type="button"
                                                            variant="secondary"
                                                            instance="history-edit-cash-breakdown"
                                                            onClick={openEditor}
                                                            aria-label="Editar desglose de efectivo"
                                                            className="w-full"
                                                        >
                                                            {hasValue ? `${text} €` : (text || ' ')}
                                                        </Button>
                                                    </div>
                                                ) : isEditing && editable && fieldKey ? (
                                                    <div className="w-[8.75rem] sm:w-[9.5rem] h-8 border border-[#36606F]/80 rounded-xl bg-white flex items-center justify-center relative shadow-sm">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="h-full w-full bg-transparent px-2 text-center text-sm font-black tabular-nums text-zinc-800 outline-none border-none focus:ring-0"
                                                            value={value || ''}
                                                            onChange={e => handleFieldUpdate(fieldKey, parseFloat(e.target.value) || 0)}
                                                        />
                                                        {hasValue && (
                                                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-zinc-500">
                                                                €
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div 
                                                        className={cn(
                                                            "w-[8.75rem] sm:w-[9.5rem] py-0.5 flex items-center justify-center relative",
                                                            onClick && "cursor-pointer hover:underline decoration-[#36606F]/50 underline-offset-4 min-h-[48px]"
                                                        )}
                                                        onClick={onClick}
                                                        role={onClick ? 'button' : undefined}
                                                        tabIndex={onClick ? 0 : undefined}
                                                        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
                                                    >
                                                        <span className={cn(
                                                            "text-sm font-black tabular-nums",
                                                            diffTone ?? 'text-zinc-800'
                                                        )}>
                                                            {text}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                };
 
                                const avgTicketVal = (current?.tickets_count || 0) > 0 
                                    ? (current?.tpv_sales || 0) / current?.tickets_count 
                                    : 0;

                                return (
                                    <div className="flex flex-col divide-y divide-zinc-100">
                                        <div className="flex items-center justify-center gap-4 pb-2">
                                            <div className="flex items-center gap-1 opacity-85">
                                                {(() => {
                                                    const weatherId = weatherIdFromLabel(selectedClosing.weather);
                                                    const weatherOpt = CLOSING_WEATHER_OPTIONS.find(o => o.id === weatherId);
                                                    if (weatherOpt) {
                                                        return (
                                                            <img
                                                                src={weatherOpt.icon}
                                                                alt=""
                                                                className="w-3 h-3 object-contain"
                                                            />
                                                        );
                                                    }
                                                    return <CloudSun size={13} className="text-amber-500" />;
                                                })()}
                                                <span className="text-[9.5px] font-normal uppercase text-zinc-500 tracking-wider">
                                                    {selectedClosing.weather || 'Clima N/A'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-85">
                                                <span className="text-[9.5px] font-normal uppercase tracking-wider text-zinc-500">
                                                    {(selectedClosing.tickets_count || 0).toLocaleString('es-ES')} TICKETS
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-85">
                                                <span className="text-[9.5px] font-normal uppercase tracking-wider text-zinc-500">
                                                    {avgTicketVal > 0 
                                                        ? `${formatCurrencyModal(avgTicketVal)} ` 
                                                        : ''}DE TICKET MEDIO
                                                </span>
                                            </div>
                                        </div>

                                        <div className="pt-4 pb-2">
                                            <RowItem
                                                label="Ventas"
                                                value={getValue('tpv_sales')}
                                                fieldKey="tpv_sales"
                                                editable={true}
                                            />
                                        </div>
                                        <div className="py-2">
                                            <RowItem
                                                label="Venta Neta"
                                                value={getValue('net_sales')}
                                            />
                                        </div>
                                        <div className="py-2">
                                            <RowItem
                                                label="Tarjeta"
                                                value={getValue('sales_card')}
                                                fieldKey="sales_card"
                                                editable={true}
                                            />
                                        </div>
                                        <div className="py-2">
                                            <RowItem
                                                label="Efectivo"
                                                value={getValue('cash_counted')}
                                                onClick={() => setShowCashDetails(true)}
                                                openEditor={() => setShowCashDetails(true)}
                                            />
                                        </div>
                                        <div className="py-2">
                                            <RowItem
                                                label="Pendiente Pago"
                                                value={getValue('sales_pending')}
                                                fieldKey="sales_pending"
                                                editable={true}
                                            />
                                        </div>
                                        <div className="py-2">
                                            <RowItem
                                                label="Cobros Pendientes"
                                                value={collectionsValue}
                                                fieldKey="debt_recovered"
                                                editable={true}
                                            />
                                        </div>
                                        <div className="py-2">
                                            <RowItem
                                                label="Diferencia"
                                                value={getValue('difference')}
                                                isDiff={true}
                                            />
                                        </div>
                                        {!isEditing && (() => {
                                            const targetDate = parseLocalSafe(selectedClosing.closing_date);
                                            const details = get8DayExpectedSalesDetails(targetDate);
                                            if (details.expectedSales <= 0.005) return null;
                                            
                                            const netVal = getValue('net_sales');
                                            const diffPercent = details.expectedSales > 0 && netVal > 0 
                                                ? ((netVal - details.expectedSales) / details.expectedSales) * 100 
                                                : 0;
                                            const scale = getRendimientoScale(details.expectedSales > 0 ? diffPercent : 0);
                                            
                                            const weekdayName = format(targetDate, 'EEEE', { locale: es });
                                            const weekdayPlural = weekdayName.endsWith('s') ? weekdayName : `${weekdayName}s`;

                                            return (
                                                <div className="pt-2 flex flex-col items-center justify-center gap-1.5 text-[11px] text-zinc-500 font-medium w-full text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <span>Esperado:</span>
                                                        <span className="font-extrabold text-zinc-700">
                                                            {details.expectedSales > 0 ? formatCurrencyModal(details.expectedSales) : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <span>Rendimiento:</span>
                                                        <div className="flex items-center gap-1 leading-none">
                                                            {details.expectedSales > 0 && (
                                                                <TrendTriangle type={scale.icon} className={scale.color} size="sm" />
                                                            )}
                                                            <span className={cn("font-extrabold", scale.color)}>
                                                                {details.expectedSales > 0 
                                                                    ? `${diffPercent >= 0 ? '+' : ''}${Math.round(diffPercent)}%` 
                                                                    : 'N/A'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {details.expectedSales > 0 && (
                                                        <p className="text-[9px] text-zinc-400 font-normal italic mt-0.5 max-w-[85%] mx-auto">
                                                            Esperado basado en los {details.daysUsed} {weekdayPlural} anteriores.
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })()}

                            {(() => {
                                const hasDataphonePhoto = !!selectedClosing.dataphone_totals_photo_path;
                                const hasBdpPhoto = !!selectedClosing.bdp_closing_ticket_photo_path;
                                const hasAnyPhoto = hasDataphonePhoto || hasBdpPhoto;

                                if (closingPhotosLoading && hasAnyPhoto) {
                                    return (
                                        <div className="grid grid-cols-2 gap-4">
                                            {hasDataphonePhoto && (
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <div className="flex h-28 w-full items-center justify-center bg-zinc-50 rounded-xl border border-zinc-100 animate-pulse">
                                                        <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                                                    </div>
                                                    <span className="text-center text-[9px] font-black uppercase leading-tight tracking-widest text-zinc-300">
                                                        Totales datáfonos
                                                    </span>
                                                </div>
                                            )}
                                            {hasBdpPhoto && (
                                                <div className="flex flex-col items-center gap-1.5">
                                                    <div className="flex h-28 w-full items-center justify-center bg-zinc-50 rounded-xl border border-zinc-100 animate-pulse">
                                                        <LoadingSpinner size="sm" className="text-[#36606F]/50" />
                                                    </div>
                                                    <span className="text-center text-[9px] font-black uppercase leading-tight tracking-widest text-zinc-300">
                                                        Informe TPV
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                            {!closingPhotosLoading && (closingPhotoUrls.dataphoneUrl || closingPhotoUrls.bdpUrl) ? (
                                <div className="grid grid-cols-2 gap-4">
                                    {closingPhotoUrls.dataphoneUrl ? (
                                        <button
                                            type="button"
                                            onClick={() => openClosingPhotoLightbox('Totales datáfonos')}
                                            className="flex min-h-[48px] flex-col items-center gap-1.5 transition-opacity active:opacity-80"
                                        >
                                            <PhotoWithSpinner
                                                src={closingPhotoUrls.dataphoneUrl}
                                                alt="Totales datáfonos"
                                            />
                                            <span className="max-w-full text-center text-[9px] font-black uppercase leading-tight tracking-widest text-gray-400">
                                                Totales datáfonos
                                            </span>
                                        </button>
                                    ) : null}
                                    {closingPhotoUrls.bdpUrl ? (
                                        <button
                                            type="button"
                                            onClick={() => openClosingPhotoLightbox('Informe TPV')}
                                            className="flex min-h-[48px] flex-col items-center gap-1.5 transition-opacity active:opacity-80"
                                        >
                                            <PhotoWithSpinner
                                                src={closingPhotoUrls.bdpUrl}
                                                alt="Informe TPV"
                                            />
                                            <span className="max-w-full text-center text-[9px] font-black uppercase leading-tight tracking-widest text-gray-400">
                                                Informe TPV
                                            </span>
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                            {!closingPhotosLoading && closingPhotosError && (selectedClosing.dataphone_totals_photo_path || selectedClosing.bdp_closing_ticket_photo_path) ? (
                                <p className="text-sm text-rose-600 text-center py-2">{closingPhotosError}</p>
                            ) : null}

                            {isEditing && (
                                <Button
                                    type="button"
                                    variant="primary"
                                    instance="history-save-closing"
                                    onClick={() => persistEditData({ exitEdit: true })}
                                    disabled={loading}
                                    loading={loading}
                                    loadingLabel="Guardando…"
                                    className="w-full"
                                >
                                    Guardar Cierre
                                </Button>
                            )}
                        </div>
                    </div>
                    {/* 3 Pagination dots block */}
                    {(() => {
                        const currentIndex = closings.findIndex(c => c.id === selectedClosing.id);
                        if (currentIndex === -1) return null;
                        
                        let activeDot = 1;
                        if (currentIndex === 0) {
                            activeDot = 2;
                        } else if (currentIndex === closings.length - 1) {
                            activeDot = 0;
                        }
                        
                        return (
                            <div className="flex justify-center gap-2.5 mt-2 select-none z-10" onClick={e => e.stopPropagation()}>
                                <button 
                                    type="button"
                                    onClick={() => {
                                        if (isEditing) return;
                                        if (currentIndex < closings.length - 1) {
                                            triggerNavigate(closings[currentIndex + 1], 'right');
                                        }
                                    }}
                                    disabled={currentIndex === closings.length - 1}
                                    className={cn(
                                        "w-2 h-2 rounded-full transition-all duration-300 outline-none",
                                        activeDot === 0 
                                            ? "bg-white scale-125 shadow-sm" 
                                            : "bg-white/40 hover:bg-white/60 disabled:opacity-30 disabled:pointer-events-none"
                                    )}
                                    aria-label="Cierre anterior"
                                />
                                <button 
                                    type="button"
                                    className={cn(
                                        "w-2 h-2 rounded-full transition-all duration-300 outline-none pointer-events-none",
                                        activeDot === 1 
                                            ? "bg-white scale-125 shadow-sm" 
                                            : "bg-white/40"
                                    )}
                                    aria-label="Cierre actual"
                                />
                                <button 
                                    type="button"
                                    onClick={() => {
                                        if (isEditing) return;
                                        if (currentIndex > 0) {
                                            triggerNavigate(closings[currentIndex - 1], 'left');
                                        }
                                    }}
                                    disabled={currentIndex === 0}
                                    className={cn(
                                        "w-2 h-2 rounded-full transition-all duration-300 outline-none",
                                        activeDot === 2 
                                            ? "bg-white scale-125 shadow-sm" 
                                            : "bg-white/40 hover:bg-white/60 disabled:opacity-30 disabled:pointer-events-none"
                                    )}
                                    aria-label="Cierre siguiente"
                                />
                            </div>
                        );
                    })()}
                </div>
                </Modal>
            )}

            {selectedClosing && (
                <CashBreakdownModal
                    isOpen={showCashDetails}
                    onClose={() => setShowCashDetails(false)}
                    breakdown={isEditing ? (editData?.breakdown ?? selectedClosing.breakdown ?? {}) : (selectedClosing.breakdown ?? {})}
                    date={selectedClosing.closed_at}
                    total={isEditing ? Number(editData?.cash_counted ?? selectedClosing.cash_counted ?? 0) : Number(selectedClosing.cash_counted ?? 0)}
                    isEditing={isEditing}
                    onUpdate={handleBreakdownUpdate}
                    saving={loading}
                    onSave={async () => {
                        // En edición: persistir YA el desglose para que el trigger actualice treasury_log (CLOSE_ENTRY).
                        if (!isEditing) {
                            setShowCashDetails(false);
                            return;
                        }
                        await persistEditData({
                            exitEdit: false,
                            successMessage: 'Desglose de efectivo actualizado (movimiento recalculado)',
                        });
                        setShowCashDetails(false);
                    }}
                />
            )}

            <CashClosingModal
                isOpen={showClosingModal}
                onClose={() => setShowClosingModal(false)}
                onSuccess={() => {
                    fetchHistory();
                    setShowClosingModal(false);
                }}
            />

            {exportMonthPickerOpen && exportPendingFormat ? (
                <Modal
                    open={true}
                    onClose={() => {
                        if (shareBusy) return;
                        setExportMonthPickerOpen(false);
                        setExportPendingFormat(null);
                    }}
                    variant="compact"
                    instance="history-export-month-picker"
                    title="Meses a exportar"
                    subtitle={`${exportPendingFormat === 'excel' ? 'Excel' : 'Imprimir / PDF'} — puedes elegir uno o varios`}
                >
                    <div
                        className="w-full max-w-sm overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="space-y-3">
                            <MonthPickerGrid
                                year={exportPickerYear}
                                onYearChange={setExportPickerYear}
                                isSelected={(monthIndex) =>
                                    exportSelectedMonths.has(
                                        toMonthKey(new Date(exportPickerYear, monthIndex, 1))
                                    )
                                }
                                onSelectMonth={(monthIndex) =>
                                    toggleExportMonth(
                                        toMonthKey(new Date(exportPickerYear, monthIndex, 1))
                                    )
                                }
                            />

                            <p className="text-center text-[10px] font-bold text-zinc-400 px-1">
                                {exportSelectedMonths.size === 0
                                    ? 'Ningún mes seleccionado'
                                    : exportSelectedMonths.size === 1
                                      ? monthKeyLabel(Array.from(exportSelectedMonths)[0])
                                      : `${exportSelectedMonths.size} meses: ${Array.from(exportSelectedMonths)
                                            .sort()
                                            .map(monthKeyLabel)
                                            .join(', ')}`}
                            </p>
                        </div>

                        <div className="mt-4 flex gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                instance="history-export-month-cancel"
                                onClick={() => {
                                    if (shareBusy) return;
                                    setExportMonthPickerOpen(false);
                                    setExportPendingFormat(null);
                                }}
                                className="flex-1"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                instance="history-export-month-confirm"
                                onClick={() => void confirmExport()}
                                disabled={!!shareBusy || exportSelectedMonths.size === 0}
                                className="flex-1"
                            >
                                {shareBusy
                                    ? 'Exportando…'
                                    : exportPendingFormat === 'excel'
                                      ? 'Descargar Excel'
                                      : 'Imprimir'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            ) : null}

            <ImageLightbox
                open={lightboxIndex !== null && closingPhotoSlides.length > 0}
                slides={closingPhotoSlides}
                activeIndex={lightboxIndex ?? 0}
                onActiveIndexChange={setLightboxIndex}
                onClose={() => setLightboxIndex(null)}
                parentInstance="history-closing-detail"
            />

            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                allowedKinds={["date", "range", "week", "month", "year"]}
                initialValue={
                    filterMode === "single"
                        ? ({ kind: "date", date: selectedDate } satisfies TimeFilterValue)
                        : rangeStart && rangeEnd
                            ? ({ kind: "range", startDate: rangeStart, endDate: rangeEnd } satisfies TimeFilterValue)
                            : ({ kind: "date", date: selectedDate } satisfies TimeFilterValue)
                }
                onApply={(v) => {
                    if (v.kind === "date") {
                        setSelectedDate(v.date);
                        setFilterMode("single");
                        return;
                    }
                    if (v.kind === "range" || v.kind === "week") {
                        setRangeStart(v.startDate);
                        setRangeEnd(v.endDate);
                        setFilterMode("range");
                        return;
                    }
                    if (v.kind === "month") {
                        const s = new Date(v.year, v.month - 1, 1);
                        const e = new Date(v.year, v.month, 0);
                        setRangeStart(format(s, "yyyy-MM-dd"));
                        setRangeEnd(format(e, "yyyy-MM-dd"));
                        setFilterMode("range");
                        return;
                    }
                    if (v.kind === "year") {
                        const s = new Date(v.year, 0, 1);
                        const e = new Date(v.year, 11, 31);
                        setRangeStart(format(s, "yyyy-MM-dd"));
                        setRangeEnd(format(e, "yyyy-MM-dd"));
                        setFilterMode("range");
                    }
                }}
            />
            {showPeriodPerformanceModal && (
                <Modal
                    open={true}
                    onClose={() => setShowPeriodPerformanceModal(false)}
                    variant="standard"
                    layer="derived"
                    instance="history-period-performance"
                    parentInstance="history-closing-detail"
                    title="Rendimiento"
                    subtitle={(() => {
                        if (filterMode === 'single') {
                            return format(parseLocalSafe(selectedDate), "d 'de' MMMM", { locale: es });
                        }
                        const start = parseLocalSafe(rangeStart);
                        const end = parseLocalSafe(rangeEnd);
                        const startMonth = format(start, 'MMMM', { locale: es });
                        const endDay = format(end, 'd');
                        const endMonth = format(end, 'MMMM', { locale: es });
                        return `1 ${startMonth} a ${endDay} ${endMonth}`;
                    })()}
                    headerTone="petroleum"
                    scrollContent={false}
                >
                    <div className="relative bg-white w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar text-zinc-900">
                            {(() => {
                                return (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 gap-6 place-items-center">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <span className="text-sm md:text-base font-black text-gray-900 leading-none">
                                                    {formatCurrencySpanish(currentNetSum)}
                                                </span>
                                                <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                                    Periodo Actual
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <span className="text-sm md:text-base font-black text-gray-900 leading-none">
                                                    {formatCurrencySpanish(prevNetSum)}
                                                </span>
                                                <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                                    Periodo mes anterior
                                                </span>
                                            </div>
                                        </div>
 
                                        <div className="pt-4 border-t border-zinc-100 grid grid-cols-2 gap-6 place-items-center">
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <span className={cn(
                                                    "text-sm md:text-base font-black leading-none",
                                                    popAbsolute >= 0 ? "text-emerald-600" : "text-rose-600"
                                                )}>
                                                    {popAbsolute >= 0 ? '+' : ''}{formatCurrencySpanish(popAbsolute)}
                                                </span>
                                                <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                                    Diferencia €
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-center justify-center text-center">
                                                <div className="flex items-center gap-1 leading-none">
                                                    {popPercent !== 0 ? (
                                                        <>
                                                            <TrendTriangle
                                                                type={getRendimientoScale(popPercent).icon}
                                                                className={getRendimientoScale(popPercent).color}
                                                            />
                                                            <span className={cn(
                                                                "text-sm md:text-base font-black tabular-nums",
                                                                getRendimientoScale(popPercent).color
                                                            )}>
                                                                {popPercent >= 0 ? '+' : ''}{popPercent.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                                                            </span>
                                                        </>
                                                    ) : null}
                                                </div>
                                                <span className="text-[9px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                                    Rendimiento
                                                </span>
                                            </div>
                                        </div>
 
                                        <div className="pt-4 border-t border-zinc-100 flex flex-col gap-2 text-zinc-500 text-[10px] md:text-[11px] leading-relaxed font-semibold text-center md:text-left">
                                            <p>
                                                El rendimiento global compara la venta neta acumulada del periodo actual contra la venta neta del mismo número de días transcurridos del periodo equivalente anterior.
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </Modal>
            )}
            
            {shareMenuOpen && (
                <Modal
                    open={shareMenuOpen}
                    onClose={() => setShareMenuOpen(false)}
                    instance="history-share-menu"
                    title="Exportar"
                    variant="compact"
                >
                    <div className="flex flex-col gap-3">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="history-export-excel"
                            onClick={() => openExportMonthPicker('excel')}
                            layout="fill"
                        >
                            Exportar Excel
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="history-export-print"
                            onClick={() => openExportMonthPicker('print')}
                            layout="fill"
                        >
                            Imprimir / PDF
                        </Button>
                    </div>
                </Modal>
            )}
        </>
    );
}