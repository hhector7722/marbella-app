'use client';

import {
    ChevronLeft, ChevronRight, Check, Circle
} from 'lucide-react';
import React, { memo, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths, getISOWeek, addDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { getOvertimeData, togglePaidStatus, togglePreferStockStatus, type WeeklyStats } from '@/app/actions/overtime';
import { cn } from '@/lib/utils';
import WorkerWeeklyHistoryModal from '@/components/WorkerWeeklyHistoryModal';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { Modal } from '@/components/ui/modal';
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
    <div onClick={onClick} className="flex items-center justify-between p-3 bg-white/60 rounded-2xl border border-purple-100/30 cursor-pointer hover:bg-white transition-colors group">
        <span className="text-xs font-bold text-gray-700 capitalize group-hover:text-purple-700 transition-colors leading-none">
            {staff.name}
        </span>
        <div className="flex items-center gap-3">
            <span className="text-xs font-black text-gray-800">
                {staff.amount > 0.05 ? `${staff.amount.toFixed(0)}€` : " "}
            </span>
            <div className="flex items-center bg-gray-100/50 rounded-full h-8 px-1 gap-1">
                <button
                    onClick={(e) => onTogglePaid(e, weekId, staff.id, !isPaid)}
                    className={cn(
                        "flex items-center justify-center transition-all active:scale-90 p-0.5",
                        isPaid ? "" : "text-gray-300 hover:text-gray-400"
                    )}
                >
                    {isPaid ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={4} />
                        </div>
                    ) : (
                        <Circle className="w-5 h-5" />
                    )}
                </button>
            </div>
        </div>
    </div>
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
                maxWidthClass="max-w-none"
                className="month-cal-shell"
                cardClassName="month-cal-card"
                contentClassName="p-0 flex flex-col min-h-0"
                rightSlot={
                    <TimeFilterButton
                        onClick={() => setIsTimeFilterOpen(true)}
                        hasActiveFilter={!isSameMonth(viewMonth, new Date()) || viewMonth.getFullYear() !== new Date().getFullYear()}
                        onClear={() => setViewMonth(startOfMonth(new Date()))}
                        buttonClassName="bg-transparent border-transparent shadow-none hover:bg-white/15 min-h-[40px] md:min-h-[40px] px-2 py-1.5"
                    />
                }
            >
                <div className="px-4 md:px-8 pt-3 pb-3 shrink-0">
                    <div className="flex justify-center w-full">
                        <div className="inline-flex items-center justify-center gap-1 sm:gap-2 max-w-full">
                            <button
                                type="button"
                                onClick={() => setViewMonth((prev) => subMonths(prev, 1))}
                                className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-ds-marca"
                                aria-label="Mes anterior"
                            >
                                <ChevronLeft size={22} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsTimeFilterOpen(true)}
                                className="text-base md:text-lg font-black text-ds-marca capitalize text-center px-1 sm:px-2 min-w-0 max-w-[min(100%,14rem)] sm:max-w-none hover:opacity-80"
                            >
                                {format(viewMonth, 'MMMM yyyy', { locale: es })}
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
                                className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-ds-marca"
                                aria-label="Mes siguiente"
                            >
                                <ChevronRight size={22} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col month-cal-body min-h-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <LoadingSpinner size="lg" className="text-ds-marca" />
                        </div>
                    ) : (
                        <div className="mx-auto w-[97%] min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] month-cal-grid-wrap flex-1 min-h-0">
                            <div className="grid grid-cols-7 border-b border-gray-100 shrink-0">
                                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, index) => (
                                    <div
                                        key={d}
                                        className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-sm border-r border-white/30 last:border-r-0"
                                    >
                                        <span className="text-[9px] font-bold text-white uppercase tracking-wider truncate px-0.5 drop-shadow-sm leading-none">
                                            <span className="hidden md:inline">{d}</span>
                                            <span className="md:hidden">{['L', 'M', 'X', 'J', 'V', 'S', 'D'][index]}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="month-cal-weeks">
                                {rows.map((rowDays, rowIndex) => {
                                    const weekId = rowWeekIds[rowIndex];
                                    const week = weeksData.find((w) => w.weekId === weekId);
                                    const completed = isPastCompletedWeek(weekId);
                                    const weekTotal = week?.totalAmount ?? 0;
                                    const isFullyPaid = week?.staff?.every((s: { totalCost?: number; amount?: number; isPaid?: boolean }) => {
                                        const cost = (s.totalCost ?? s.amount ?? 0);
                                        return cost < 0.05 || !!s.isPaid;
                                    }) ?? false;
                                    const clickable = completed && !!week;

                                    return (
                                        <div
                                            key={weekId || rowIndex}
                                            className="grid grid-cols-7 border-b border-gray-100 last:border-b-0 month-cal-week"
                                        >
                                            {rowDays.map((day, dayIndex) => {
                                                const inMonth = isSameMonth(day, viewMonth);
                                                const todayCell = isSameDay(day, today);
                                                const isMonday = dayIndex === 0;
                                                const canOpen = clickable && inMonth;

                                                return (
                                                    <button
                                                        key={day.getTime()}
                                                        type="button"
                                                        disabled={!canOpen}
                                                        onClick={
                                                            canOpen
                                                                ? () => {
                                                                      if (!week) return;
                                                                      setWeekDetailModal({ week });
                                                                  }
                                                                : undefined
                                                        }
                                                        className={cn(
                                                            'group relative flex flex-col text-left min-h-[52px] md:min-h-[100px] transition-colors p-0.5 sm:p-1 month-cal-cell',
                                                            'border-r border-gray-100 last:border-r-0 bg-white',
                                                            !inMonth && 'opacity-25 pointer-events-none',
                                                            canOpen && 'hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer',
                                                            todayCell && inMonth && 'bg-blue-50/10',
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                'absolute top-1 right-1 text-[9px] font-bold',
                                                                todayCell && inMonth ? 'text-blue-600' : 'text-gray-400',
                                                            )}
                                                        >
                                                            {format(day, 'd')}
                                                        </span>
                                                        {clickable && inMonth && isMonday ? (
                                                            <div className="flex-1 flex flex-col justify-center items-center min-h-0 pt-4 gap-0.5">
                                                                <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-zinc-400">
                                                                    Semana {getISOWeek(day)}
                                                                </span>
                                                                <span className="text-[9px] min-[370px]:text-[11px] md:text-lg font-black tabular-nums leading-none text-zinc-900">
                                                                    {weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                                                                </span>
                                                                {isFullyPaid ? (
                                                                    <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm mt-0.5">
                                                                        <Check className="w-2 h-2 md:w-2.5 md:h-2.5 text-white" strokeWidth={4} />
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-rose-500 flex items-center justify-center shadow-sm mt-0.5">
                                                                        <span className="text-white font-black text-[7px] leading-none">!</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : clickable && inMonth ? (
                                                            <div className="flex-1 flex items-center justify-center min-h-0 pt-4">
                                                                {isFullyPaid ? (
                                                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" />
                                                                ) : (
                                                                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-sm" />
                                                                )}
                                                            </div>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
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
                        <div className="space-y-3">
                            <span className="text-base font-black text-zinc-900 leading-none">
                                {weekTotal > 0.05 ? `${weekTotal.toFixed(0)}€` : ' '}
                            </span>
                            <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                            <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                            <div className="space-y-2">
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
                                    <p className="text-center text-zinc-400 text-xs font-bold uppercase tracking-widest py-4">Sin importes esta semana</p>
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
