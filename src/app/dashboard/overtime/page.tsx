'use client';

import {
    Check, Circle
} from 'lucide-react';
import React, { memo, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths, getISOWeek, addDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { getOvertimeData, togglePaidStatus, togglePreferStockStatus } from '@/app/actions/overtime';
import type { WeeklyStats } from '@/lib/hours-engine/overtime-weeks-ssot';
import { cn } from '@/lib/utils';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { WorkerListSummary, WorkerPersonRow } from '@/components/staff/WorkerPersonRow';
import { PeriodNav, PeriodFilterButton } from '@/components/time/PeriodNav';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import { periodTodayClassName } from '@/components/time/MonthPickerGrid';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { overtimeWeekDetailUsageLabel } from '@/lib/usage/modal-apply';

// REGLA ZERO-DISPLAY: En vistas de lectura, cualquier valor igual a 0 debe mostrarse como un espacio vacío " ".
const formatDisplay = (val: number, suffix: string = '') => {
    if (val === 0) return " ";
    return `${val.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${suffix}`;
};

/** Fecha local desde YYYY-MM-DD (evita desfase UTC). */
function parseLocalYmd(ymd: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Semana lun–dom cerrada: el domingo (lunes+6) es estrictamente anterior al día local de hoy. */
function isPastCompletedWeek(weekMondayYmd: string): boolean {
    const [y, m, d] = weekMondayYmd.split('-').map(Number);
    const sunday = new Date(y, m - 1, d + 6);
    const t = new Date();
    const today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return sunday < today0;
}

// Fila de staff en el modal (réplica del dashboard)
const StaffOvertimeRow = memo(({
    staff,
    weekId,
    isPaid,
    onTogglePaid,
    onClick
}: {
    staff: { id: string; name: string; amount: number };
    weekId: string;
    isPaid: boolean;
    onTogglePaid: (e: React.MouseEvent, weekId: string, staffId: string, status: boolean) => void;
    onClick: () => void;
}) => (
    <WorkerPersonRow
        name={staff.name}
        value={staff.amount > 0.05 ? `${staff.amount.toFixed(0)}€` : ' '}
        onClick={onClick}
        trailing={
            <button
                type="button"
                onClick={(e) => onTogglePaid(e, weekId, staff.id, !isPaid)}
                className={cn(
                    'flex h-8 w-8 items-center justify-center',
                    isPaid ? '' : 'text-zinc-300 hover:text-zinc-400',
                )}
                aria-label={isPaid ? 'Marcar no pagado' : 'Marcar pagado'}
            >
                {isPaid ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                        <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} />
                    </span>
                ) : (
                    <Circle className="h-5 w-5" />
                )}
            </button>
        }
    />
));
StaffOvertimeRow.displayName = 'StaffOvertimeRow';

export default function OvertimePage() {
    const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
    const [weeksData, setWeeksData] = useState<WeeklyStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [weekDetailModal, setWeekDetailModal] = useState<{ week: any } | null>(null);

    const weekDetailTrackingLabel = useMemo(() => {
        if (!weekDetailModal) return 'Detalle semana horas extras';
        const weekStart = parseLocalYmd(weekDetailModal.week.weekId);
        return overtimeWeekDetailUsageLabel(weekDetailModal.week.weekId, getISOWeek(weekStart));
    }, [weekDetailModal]);

    const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>({});
    const [selectedHistory, setSelectedHistory] = useState<{ workerId: string; weekId: string } | null>(null);
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
    const [calculatorOpen, setCalculatorOpen] = useState(false);

    useEffect(() => {
        const start = format(startOfMonth(viewMonth), 'yyyy-MM-dd');
        const end = format(endOfMonth(viewMonth), 'yyyy-MM-dd');
        setLoading(true);
        getOvertimeData(start, end)
            .then((result) => {
                if (result?.weeksResult) setWeeksData(result.weeksResult);
                else setWeeksData([]);
            })
            .catch(() => setWeeksData([]))
            .finally(() => setLoading(false));
    }, [viewMonth]);

    const handleTogglePaid = async (e: React.MouseEvent, weekId: string, staffId: string, newStatus: boolean) => {
        e.stopPropagation();
        const key = `${weekId}-${staffId}`;
        setPaidStatus(prev => ({ ...prev, [key]: newStatus }));
        setWeeksData(prev => prev.map(w => w.weekId === weekId
            ? { ...w, staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: newStatus } : s) }
            : w));
        try {
            const weekData = weeksData.find(w => w.weekId === weekId);
            const staffData = weekData?.staff?.find((s: any) => s.id === staffId);
            const result = await togglePaidStatus(staffId, weekId, newStatus, {
                totalHours: staffData?.totalHours ?? 0,
                overtimeHours: staffData?.overtimeHours ?? 0
            });
            if (!result.success) throw new Error("Error updating paid status");
            toast.success(newStatus ? "Marcado como pagado" : "Pago cancelado");
        } catch (error) {
            setPaidStatus(prev => ({ ...prev, [key]: !newStatus }));
            setWeeksData(prev => prev.map(w => w.weekId === weekId
                ? { ...w, staff: w.staff.map(s => s.id === staffId ? { ...s, isPaid: !newStatus } : s) }
                : w));
            toast.error("Error al actualizar pago");
        }
    };

    const handleTogglePreferStock = async (e: React.MouseEvent, weekId: string, staffId: string, currentStatus: boolean) => {
        e.stopPropagation();
        try {
            toast.loading("Actualizando balances...", { id: 'prefer-stock-toggle' });
            const result = await togglePreferStockStatus(staffId, weekId, currentStatus);
            if (!result.success) throw new Error(result.error);
            toast.success(result.newStatus ? "Enviado a Bolsa de Horas" : "Cambiado a Pago en Nómina", { id: 'prefer-stock-toggle' });
            const start = format(startOfMonth(viewMonth), 'yyyy-MM-dd');
            const end = format(endOfMonth(viewMonth), 'yyyy-MM-dd');
            const res = await getOvertimeData(start, end);
            if (res?.weeksResult) setWeeksData(res.weeksResult);
        } catch (error: any) {
            toast.error("Error al actualizar modo: " + error.message, { id: 'prefer-stock-toggle' });
        }
    };

    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    const today = new Date();
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    const rowWeekIds = rows.map(row => row[0] ? format(row[0], 'yyyy-MM-dd') : '');

    return (
        <>
            <DashboardDetailLayout
                title="Horas extras"
                showBackButton={false}
                template="list"
                work="calendar"
                className="month-cal-shell"
                cardClassName="month-cal-card"
                contentClassName="p-0 flex flex-col min-h-0 month-cal-body"
                periodSlot={
                    <PeriodNav
                        label={format(viewMonth, 'MMMM yyyy', { locale: es })}
                        onPrev={() => setViewMonth((prev) => subMonths(prev, 1))}
                        onNext={() => setViewMonth((prev) => addMonths(prev, 1))}
                        onLabelClick={() => setIsTimeFilterOpen(true)}
                    />
                }
                rightSlot={
                    <PeriodFilterButton instance="overtime-period-filter" onClick={() => setIsTimeFilterOpen(true)} />
                }
            >
                <div className="flex flex-col min-h-0 min-w-0 flex-1">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <LoadingSpinner size="lg" className="text-ds-marca" />
                        </div>
                    ) : (
                        <MonthCalendarFrame>
                            <div className="month-cal-weeks">
                                {rows.map((rowDays, rowIndex) => {
                                    const weekId = rowDays[0] ? format(rowDays[0], 'yyyy-MM-dd') : '';
                                    const isCompleted = isPastCompletedWeek(weekId);
                                    const week = weeksData.find(w => w.weekId === weekId);
                                    
                                    const isFullyPaid = week?.staff?.every((s: { totalCost?: number; amount?: number; isPaid?: boolean }) => {
                                        const cost = (s.totalCost ?? s.amount ?? 0);
                                        return cost < 0.05 || !!s.isPaid;
                                    });
                                    const weekTotal = week?.totalAmount ?? 0;
                                    const weekStart = weekId ? parseLocalYmd(weekId) : new Date();

                                    return (
                                        <div key={rowIndex} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0 month-cal-week relative min-h-[5.5rem] group">
                                            {/* Días del calendario */}
                                            {rowDays.map((day) => {
                                                const inMonth = isSameMonth(day, viewMonth);
                                                const isToday = isSameDay(day, today);
                                                const isPastDay = inMonth && isBefore(day, startOfDay(today));
                                                const pastDayBg = isPastDay ? 'bg-zinc-50/90' : 'bg-white';
                                                
                                                return (
                                                    <div
                                                        key={day.getTime()}
                                                        className={cn(
                                                            'relative flex flex-col p-1 sm:p-1.5 month-cal-cell',
                                                            'border-r border-gray-100 last:border-r-0',
                                                            pastDayBg,
                                                            !inMonth && 'opacity-25',
                                                            isToday && inMonth && !isPastDay && 'bg-blue-50/10'
                                                        )}
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            <span
                                                                className={cn(
                                                                    'flex h-5 w-5 items-center justify-center rounded-full text-[10px] sm:text-[11px] font-bold leading-none tabular-nums',
                                                                    isToday ? periodTodayClassName(true) : 'text-zinc-500'
                                                                )}
                                                            >
                                                                {format(day, 'd')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            
                                            {/* Overlay botón semana */}
                                            {isCompleted && week && (
                                                <div className="absolute inset-x-2 sm:inset-x-4 top-8 bottom-1.5 flex items-stretch z-10">
                                                    <button
                                                        type="button"
                                                        onClick={() => setWeekDetailModal({ week })}
                                                        className="w-full bg-white border border-zinc-200 shadow-sm rounded-md flex items-center justify-between px-3 hover:border-purple-200 hover:shadow-md transition-all active:scale-[0.99]"
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="shrink-0 flex items-center justify-center w-6">
                                                                {isFullyPaid ? (
                                                                    <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                                                                        <Check className="w-3 h-3 text-white" strokeWidth={4} />
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-4 h-4 rounded-full bg-rose-500 flex items-center justify-center shadow-sm">
                                                                        <span className="text-white font-black text-[9px] leading-none">!</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-col items-start min-w-0">
                                                                <span className="text-[10px] sm:text-xs font-black text-zinc-800 uppercase truncate">
                                                                    Semana {getISOWeek(weekStart)}
                                                                </span>
                                                                {week.staff?.length > 0 && (
                                                                    <span className="text-[9px] sm:text-[10px] text-zinc-500 truncate">
                                                                        {week.staff.length} empleado{week.staff.length !== 1 ? 's' : ''}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className="text-xs sm:text-sm font-black text-zinc-900 tabular-nums shrink-0 text-right">
                                                            {weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : '0€'}
                                                        </span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </MonthCalendarFrame>
                    )}
                </div>
            </DashboardDetailLayout>

            {/* Modal detalle semana */}
            {weekDetailModal && (() => {
                const weekStaff = (weekDetailModal.week.staff ?? []).filter((s: any) => {
                    const cost = (s.totalCost ?? s.amount ?? 0);
                    return cost > 0.05;
                });
                const weekTotal = weekStaff.reduce((sum: number, s: any) => sum + (s.totalCost ?? s.amount ?? 0), 0);
                const modalWeekStart = parseLocalYmd(weekDetailModal.week.weekId);
                const weekNum = getISOWeek(modalWeekStart);
                const periodStr = `${format(modalWeekStart, 'd MMM', { locale: es })} - ${format(addDays(modalWeekStart, 6), 'd MMM yyyy', { locale: es })}`;
                return (
                    <Modal
                        open
                        onClose={() => {
                            setWeekDetailModal(null);
                            setSelectedHistory(null);
                        }}
                        variant="standard"
                        layer="base"
                        instance="overtime-week-detail"
                        usageId="overtime-week-detail"
                        usageLabel={weekDetailTrackingLabel}
                        headerTone="petroleum"
                        title={`Semana ${weekNum}`}
                        subtitle={periodStr}
                    >
                        <div>
                            <WorkerListSummary
                                metrics={[]}
                                total={weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                            />
                            <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                            <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                            <div>
                                {weekStaff.map((s: any) => (
                                    <StaffOvertimeRow
                                        key={s.id}
                                        staff={{ id: s.id, name: s.name?.split?.(' ')[0] ?? s.name, amount: s.totalCost ?? s.amount ?? 0 }}
                                        weekId={weekDetailModal.week.weekId}
                                        isPaid={paidStatus[`${weekDetailModal.week.weekId}-${s.id}`] ?? !!s.isPaid}
                                        onTogglePaid={handleTogglePaid}
                                        onClick={() => {
                                            setSelectedHistory({ workerId: s.id, weekId: weekDetailModal.week.weekId });
                                        }}
                                    />
                                ))}
                                {weekStaff.length === 0 && (
                                    <EmptyState instance="overtime-week-none" variant="none" title="Sin importes esta semana" />
                                )}
                            </div>
                        </div>
                    </Modal>
                );
            })()}

            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                allowedKinds={['month', 'year']}
                defaultKind="month"
                initialValue={{ kind: 'month', year: viewMonth.getFullYear(), month: viewMonth.getMonth() + 1 } satisfies TimeFilterValue}
                onApply={(v) => {
                    if (v.kind === 'month') {
                        setViewMonth(new Date(v.year, v.month - 1, 1));
                        return;
                    }
                    if (v.kind === 'year') {
                        setViewMonth(new Date(v.year, 0, 1));
                    }
                }}
            />

            <WorkerWeeklyHistoryModal
                isOpen={!!selectedHistory}
                onClose={() => setSelectedHistory(null)}
                workerId={selectedHistory?.workerId || ''}
                weekStart={selectedHistory?.weekId || ''}
                layer="derived"
                parentInstance="overtime-week-detail"
            />
        </>
    );
}
