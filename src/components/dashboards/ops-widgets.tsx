'use client';

import Link from 'next/link';
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    getISOWeek,
    isSameDay,
    isSameMonth,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
    AlertTriangle,
    Check,
    ChevronLeft,
    ChevronRight,
    Minus,
    Plus,
    RefreshCw,
    ShoppingCart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Surface } from '@/components/ui/Surface';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { periodTodayClassName } from '@/components/time/MonthPickerGrid';

function formatCentsToEur(cents: number, opts?: { showPlus?: boolean }) {
    const showPlus = opts?.showPlus ?? false;
    const neg = cents < 0;
    const abs = Math.abs(cents);
    const euros = Math.trunc(abs / 100);
    const c = abs % 100;
    const prefix = neg ? '-' : showPlus && cents > 0 ? '+' : '';
    return `${prefix}${euros}.${String(c).padStart(2, '0')}€`;
}

export function formatChangeBoxEur(v: number) {
    return v > 0.005 ? (Math.abs(v - Math.round(v)) < 0.005 ? `${Math.round(v)}€` : `${v.toFixed(2)}€`) : ' ';
}

export type CajaInicialWidgetProps = {
    treasuryLoading: boolean;
    boxes: any[];
    actualBalance: number;
    differenceCents: number;
    onOpenMovements: () => void;
    onIn: (box: any) => void;
    onOut: (box: any) => void;
    onPurchase: () => void;
    onAudit: (box: any) => void;
};

const CAJA_INICIAL_ACTION =
    'group row-span-2 grid h-full min-h-0 min-w-0 grid-rows-subgrid justify-items-center bg-transparent px-1 transition-all active:scale-95';

export function CajaInicialWidget({
    treasuryLoading,
    boxes,
    actualBalance,
    differenceCents,
    onOpenMovements,
    onIn,
    onOut,
    onPurchase,
    onAudit,
}: CajaInicialWidgetProps) {
    const isDifferenceZero = differenceCents === 0;
    return (
        <Surface
            variant="page"
            instance="dashboard-caja-inicial"
            className="flex h-full min-h-0 flex-col overflow-hidden"
        >
            {treasuryLoading ? (
                <div className="flex h-full items-center justify-center" role="status" aria-label="Cargando caja">
                    <LoadingSpinner size="md" className="text-emerald-600" />
                </div>
            ) : (
                boxes
                    .filter((b) => b.type === 'operational')
                    .map((box) => (
                        <div key={box.id} className="flex h-full min-h-0 w-full items-center">
                            <div className="grid w-full grid-cols-[repeat(2,minmax(0,1fr))_auto_repeat(2,minmax(0,1fr))] grid-rows-[auto_auto] items-end gap-x-1 gap-y-3 px-2 py-1">
                            <button type="button" onClick={onPurchase} className={cn(CAJA_INICIAL_ACTION, 'col-start-1')}>
                                <div className="flex h-9 w-9 items-center justify-center self-end rounded-full bg-[#5B8FB9] shadow-sm transition-transform group-hover:scale-110">
                                    <ShoppingCart size={16} strokeWidth={1.75} fill="none" className="text-white" />
                                </div>
                                <span className="flex items-center self-center text-[8px] font-black uppercase leading-none tracking-widest text-zinc-500">
                                    Compra
                                </span>
                            </button>
                            <button type="button" onClick={() => onAudit(box)} className={cn(CAJA_INICIAL_ACTION, 'col-start-2')}>
                                <div className="flex h-9 w-9 items-center justify-center self-end rounded-full bg-orange-400 shadow-sm transition-transform group-hover:scale-110">
                                    <RefreshCw size={16} strokeWidth={1.75} fill="none" className="text-white" />
                                </div>
                                <span className="flex items-center self-center text-[8px] font-black uppercase leading-none tracking-widest text-zinc-500">
                                    Arqueo
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={onOpenMovements}
                                className="col-start-3 row-start-1 flex h-9 w-fit min-w-0 cursor-pointer flex-col items-center justify-center gap-px self-end justify-self-center rounded-lg bg-emerald-600 px-2 py-0 text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95"
                            >
                                <span className="text-[11px] font-black leading-none">
                                    {Math.abs(actualBalance) > 0.005 ? `${actualBalance.toFixed(2)}€` : ' '}
                                </span>
                                <span className="text-[7px] font-black uppercase leading-none tracking-wider opacity-80">
                                    Caja Inicial
                                </span>
                            </button>
                            <div className="col-start-3 row-start-2 flex items-center justify-center justify-self-center self-center">
                                {isDifferenceZero ? (
                                    <span className="flex items-center text-emerald-500">
                                        <Check className="h-2 w-2" strokeWidth={3} />
                                    </span>
                                ) : (
                                    <span
                                        className={cn(
                                            'flex items-center gap-1 text-[8px] font-black uppercase leading-none tracking-widest',
                                            differenceCents < 0 ? 'text-rose-500' : 'text-emerald-500'
                                        )}
                                    >
                                        <AlertTriangle className="h-2 w-2 shrink-0" strokeWidth={3} />
                                        {formatCentsToEur(differenceCents, { showPlus: true })}
                                    </span>
                                )}
                            </div>
                            <button type="button" onClick={() => onOut(box)} className={cn(CAJA_INICIAL_ACTION, 'col-start-4')}>
                                <div className="flex h-9 w-9 items-center justify-center self-end rounded-full bg-rose-500 shadow-sm transition-transform group-hover:scale-110">
                                    <Minus size={16} strokeWidth={1.75} fill="none" className="text-white" />
                                </div>
                                <span className="flex items-center self-center text-[8px] font-black uppercase leading-none tracking-widest text-zinc-500">
                                    Salida
                                </span>
                            </button>
                            <button type="button" onClick={() => onIn(box)} className={cn(CAJA_INICIAL_ACTION, 'col-start-5')}>
                                <div className="flex h-9 w-9 items-center justify-center self-end rounded-full bg-emerald-500 shadow-sm transition-transform group-hover:scale-110">
                                    <Plus size={16} strokeWidth={1.75} fill="none" className="text-white" />
                                </div>
                                <span className="flex items-center self-center text-[8px] font-black uppercase leading-none tracking-widest text-zinc-500">
                                    Entrada
                                </span>
                            </button>
                            </div>
                        </div>
                    ))
            )}
        </Surface>
    );
}

const WEEKDAY_INITIALS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export type HorasExtrasWidgetProps = {
    overtimeViewMonth: Date;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    overtimeLoading: boolean;
    overtimeWeeksData: any[];
    onWeekClick: (week: any) => void;
};

export function HorasExtrasWidget({
    overtimeViewMonth,
    onPrevMonth,
    onNextMonth,
    overtimeLoading,
    overtimeWeeksData,
    onWeekClick,
}: HorasExtrasWidgetProps) {
    return (
        <Surface variant="page" instance="dashboard-horas-extras" className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-1 px-2 pt-1.5">
                <div className="flex min-w-0 flex-1 items-center justify-center">
                    <div className="inline-flex items-center gap-0.5 rounded-lg">
                        <button
                            type="button"
                            onClick={onPrevMonth}
                            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-all hover:bg-zinc-100 active:scale-[0.98] touch-manipulation"
                            aria-label="Mes anterior"
                        >
                            <ChevronLeft className="h-3.5 w-3.5 text-zinc-700" />
                        </button>
                        <span className="min-w-[64px] whitespace-nowrap text-center text-[8px] font-black uppercase tracking-widest text-zinc-700">
                            {format(overtimeViewMonth, 'MMMM yyyy', { locale: es })}
                        </span>
                        <button
                            type="button"
                            onClick={onNextMonth}
                            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-all hover:bg-zinc-100 active:scale-[0.98] touch-manipulation"
                            aria-label="Mes siguiente"
                        >
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-700" />
                        </button>
                    </div>
                </div>
                <Link href="/dashboard/overtime" className="shrink-0 text-[6px] font-black text-zinc-400 hover:text-zinc-700">
                    Ver más
                </Link>
            </div>
            <div className="relative min-h-0 flex-1 pl-1.5 pr-2 pb-2 pt-3">
                {overtimeLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Cargando horas extras">
                        <LoadingSpinner size="md" className="text-purple-600" />
                    </div>
                ) : (
                    <div className="flex h-full min-h-0 justify-start gap-0.5">
                        {(() => {
                            const start = startOfWeek(startOfMonth(overtimeViewMonth), { weekStartsOn: 1 });
                            const end = endOfWeek(endOfMonth(overtimeViewMonth), { weekStartsOn: 1 });
                            const days = eachDayOfInterval({ start, end });
                            const today = new Date();
                            const currentWeekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                            const rows: Date[][] = [];
                            for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
                            const rowWeekIds = rows.map((rowDays) => (rowDays[0] ? format(rowDays[0], 'yyyy-MM-dd') : ''));
                            return (
                                <>
                                    <div className="flex h-full min-h-0 shrink-0 flex-col">
                                        <div className="grid h-4 shrink-0 grid-cols-7">
                                            {WEEKDAY_INITIALS.map((d) => (
                                                <div
                                                    key={d}
                                                    className="flex w-5 items-center justify-center text-[7px] font-medium leading-none"
                                                >
                                                    {d}
                                                </div>
                                            ))}
                                        </div>
                                        {rows.map((rowDays, rowIndex) => (
                                            <div key={rowIndex} className="grid min-h-0 flex-1 grid-cols-7">
                                                {rowDays.map((day) => {
                                                    const inMonth = isSameMonth(day, overtimeViewMonth);
                                                    const isToday = isSameDay(day, today);
                                                    return (
                                                        <div
                                                            key={day.getTime()}
                                                            className="flex h-full w-5 items-center justify-center"
                                                        >
                                                            <div
                                                                className={cn(
                                                                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium',
                                                                    !inMonth && !isToday && 'opacity-25',
                                                                    inMonth && !isToday && 'text-zinc-600',
                                                                    isToday && periodTodayClassName(true)
                                                                )}
                                                            >
                                                                {format(day, 'd')}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
                                        <div className="h-4 shrink-0" aria-hidden />
                                        {rowWeekIds.map((weekId) => {
                                            if (weekId === currentWeekStart) {
                                                return <div key={weekId} className="min-h-0 flex-1" aria-hidden />;
                                            }
                                            const week = overtimeWeeksData.find((w: any) => w.weekId === weekId);
                                            if (!week) {
                                                return <div key={weekId} className="min-h-0 flex-1" aria-hidden />;
                                            }
                                            const isFullyPaid = week.staff?.every((s: any) => {
                                                const cost = s.totalCost ?? s.amount ?? 0;
                                                return cost < 0.05 || !!s.isPaid || s.preferStock === true;
                                            });
                                            const weekTotal = week.totalAmount ?? week.total ?? 0;
                                            return (
                                                <button
                                                    key={week.weekId}
                                                    type="button"
                                                    onClick={() => onWeekClick(week)}
                                                    className={cn(
                                                        'flex min-h-0 w-full min-w-0 flex-1 items-center gap-1 rounded-md py-0 pl-0 pr-0.5 text-left',
                                                        'border-0 bg-transparent hover:bg-purple-50/50'
                                                    )}
                                                >
                                                    <div className="flex shrink-0 items-center gap-1">
                                                        {isFullyPaid ? (
                                                            <div className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
                                                                <Check className="h-1.5 w-1.5 text-white" strokeWidth={4} />
                                                            </div>
                                                        ) : (
                                                            <div className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full bg-rose-500 shadow-sm">
                                                                <span className="text-[6px] font-black leading-none text-white">!</span>
                                                            </div>
                                                        )}
                                                        <span className="whitespace-nowrap text-[10px] font-normal text-zinc-500">
                                                            Semana {getISOWeek(new Date(week.weekId))}
                                                        </span>
                                                    </div>
                                                    <span className="ml-auto shrink-0 whitespace-nowrap text-right text-[10px] font-normal tabular-nums text-zinc-900">
                                                        {weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>
        </Surface>
    );
}

export type CajaCambioWidgetProps = {
    title: string;
    idx: number;
    treasuryLoading: boolean;
    box: any | undefined;
    onAudit: (box: any) => void;
};

export function CajaCambioWidget({ title, treasuryLoading, box, onAudit }: CajaCambioWidgetProps) {
    return (
        <button
            type="button"
            aria-label={title}
            disabled={!box && !treasuryLoading}
            onClick={() => {
                if (box) onAudit(box);
            }}
            className="flex h-full min-h-0 w-full items-center justify-center"
        >
            {treasuryLoading ? (
                <LoadingSpinner size="sm" className="text-zinc-500" />
            ) : (
                <span className="text-sm font-black leading-none tabular-nums text-zinc-800">
                    {box ? formatChangeBoxEur(Number(box.current_balance ?? 0)) : ' '}
                </span>
            )}
        </button>
    );
}
